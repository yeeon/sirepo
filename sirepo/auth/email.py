# -*- coding: utf-8 -*-
u"""Email login support

:copyright: Copyright (c) 2018 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkconfig
from pykern import pkinspect
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp
from sirepo import api_perm
from sirepo import auth
from sirepo import http_reply
from sirepo import http_request
from sirepo import server
from sirepo import simulation_db
from sirepo import uri_router
from sirepo import user_db
from sirepo import util
import datetime
import flask
import flask_mail
import pyisemail
import re
import sirepo.auth
import sirepo.template
try:
    # py2
    from urllib import urlencode
except ImportError:
    # py3
    from urllib.parse import urlencode

#: User can see it
AUTH_METHOD_VISIBLE = True

#: Used by user_db
UserModel = None

#: module handle
this_module = pkinspect.this_module()

#: SIREPO_EMAIL_AUTH_SMTP_SERVER=dev avoids SMTP entirely
_DEV_SMTP_SERVER = 'dev'

#: How to send mail (flask_mail.Mail instance)
_smtp = None

#: how long before token expires
_EXPIRES_MINUTES = 15

#: for adding to now
_EXPIRES_DELTA = datetime.timedelta(minutes=_EXPIRES_MINUTES)


@api_perm.require_cookie_sentinel
def api_emailAuthLogin():
    """Login the user from the form.
    User can be l
    """
    data = http_request.parse_json()
    email = _parse_email(data)
    sim_type = sirepo.template.assert_sim_type(data.simulationType)
    with user_db.thread_lock:
        u = AuthEmail.search_by(unverified_email=email)
        if u:
            # might be different uid, but don't care for now, just logout
            user_state.logout_as_user(this_module)
        else:
            uid = auth.unchecked_get_user()
            if uid:
                u = AuthEmail.search_by(uid=uid)
            else:
                u = AuthEmail.create_user(uid=uid, unverified_email=email)
        token = u.create_token()
        u.save()
    return _send_login_email(
        u,
        uri_router.uri_for_api(
            'emailAuthorized',
            dict(simulation_type=sim_type, token=token),
        ),
    )


@api_perm.allow_cookieless_set_user
def api_emailAuthorized(simulation_type, token):
    """Clicked by user in an email

    User exists in db, but there user may be logging in via a different
    browser.
    """
    sim_type = sirepo.template.assert_sim_type(simulation_type)
    with user_db.thread_lock:
        u = AuthEmail.search_by(token=token)
        if not u or u.expires < datetime.datetime.utcnow():
            # if the auth is invalid, but the user is already logged
            # in (ie. following an old link from an email) keep the
            # user logged in and proceed to the app
            if _user_with_email_is_logged_in():
                return flask.redirect('/{}'.format(sim_type))
            if not u:
                pkdlog('login with invalid token: {}', token)
            else:
                pkdlog(
                    'login with expired token: {}, email: {}',
                    token,
                    u.unverified_email,
                )
            s = simulation_db.get_schema(sim_type)
            #TODO(pjm): need uri_router method for this?
            return server.javascript_redirect(
                '/{}#{}'.format(
                    sim_type,
                    s.localRoutes.authorizationFailed.route,
                ),
            )
        # delete old record if there was one. This would happen
        # if there was a email change.
        u.query.filter(
            AuthEmail.user_name == u.unverified_email,
            AuthEmail.unverified_email != u.unverified_email,
        ).delete()
        u.user_name = u.unverified_email
        u.token = None
        u.expires = None
        u.save()
        user_state.login_as_user(u, this_module)
#TODO(robnagler) user_state.set_logged_in should do all the work
    return flask.redirect('/{}'.format(sim_type))


def init_apis(app, *args, **kwargs):
    assert not UserModel
    _init(app)
    user_db.init(app, _init_email_auth_model)
    uri_router.register_api_module()
    user_state.register_login_module()
    if cfg.oauth_compat:
        global oauth
        from sirepo import oauth

        oauth.init_module(app)


def _init(app):
    global cfg
    cfg = pkconfig.init(
        #TODO(robnagler) validate email
        from_email=pkconfig.Required(str, 'From email address'),
        from_name=pkconfig.Required(str, 'From display name'),
        oauth_compat=(False, bool, 'backward compatibility: try to find user in oauth'),
        smtp_password=pkconfig.Required(str, 'SMTP auth password'),
        smtp_server=pkconfig.Required(str, 'SMTP TLS server'),
        smtp_user=pkconfig.Required(str, 'SMTP auth user'),
    )
    if pkconfig.channel_in('dev') and cfg.smtp_server == _DEV_SMTP_SERVER:
        return
    app.config.update(
        MAIL_USE_TLS=True,
        MAIL_PORT=587,
        MAIL_SERVER=cfg.smtp_server,
        MAIL_USERNAME=cfg.smtp_user,
        MAIL_PASSWORD=cfg.smtp_password,
    )
    global _smtp
    _smtp = flask_mail.Mail(app)


def _init_email_auth_model(db, base):
    """Creates AuthEmail class bound to dynamic `db` variable"""
    global AuthEmail, UserModel

    # Primary key is unverified_email.
    # New user: (unverified_email, uid, token, expires) -> auth -> (unverified_email, uid, email)
    # Existing user: (unverified_email, token, expires) -> auth -> (unverified_email, uid, email)

    # display_name is prompted after first login

### subclass model passed into _init_email_auth_model
    class AuthEmail(base, db.Model):
        EMAIL_SIZE = 255
        TOKEN_SIZE = 16
        __tablename__ = 'auth_email_t'
        unverified_email = db.Column(db.String(EMAIL_SIZE), primary_key=True)
        uid = db.Column(db.String(8))
        user_name = db.Column(db.String(EMAIL_SIZE), unique=True)
        display_name = db.Column(db.String(100))
        token = db.Column(db.String(TOKEN_SIZE))
        expires = db.Column(db.DateTime())

        def create_token(self):
            token = util.random_base62(self.TOKEN_SIZE)
            self.expires = datetime.datetime.utcnow() + _EXPIRES_DELTA
            self.token = token
            return token


    UserModel = AuthEmail
    return AuthEmail.__tablename__


def _parse_email(data):
    res = data.email.lower()
    assert pyisemail.is_email(res), \
        'invalid post data: email={}'.format(data.email)
    return res


def _send_login_email(user, url):
    if not _smtp:
        assert pkconfig.channel_in('dev')
        pkdlog('{}', url)
        return http_reply.gen_json_ok({'url': url})
    login_text = u'sign in to' if user.user_name else \
        u'confirm your email and finish creating'
    msg = flask_mail.Message(
        subject='Sign in to Sirepo',
        sender=(cfg.from_name, cfg.from_email),
        recipients=[user.unverified_email],
        body=u'''
Click the link below to {} your Sirepo account.

This link will expire in {} minutes and can only be used once.

{}
'''.format(login_text, _EXPIRES_MINUTES, url)
    )
    _smtp.send(msg)
    return http_reply.gen_json_ok()


def _user_with_email_is_logged_in():
    if user_state.is_logged_in():
        user = AuthEmail.search_by(uid=auth.get_user())
        if user and user.user_name and user.user_name == user.unverified_email:
            return True
    return False
