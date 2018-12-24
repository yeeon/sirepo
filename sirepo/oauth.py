# -*- coding: utf-8 -*-
u"""OAUTH support

:copyright: Copyright (c) 2016 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function

from pykern import pkconfig, pkcollections
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp
from sirepo import api_auth
from sirepo import api_perm
from sirepo import cookie
from sirepo import server
from sirepo import uri_router
from sirepo import user_db
from sirepo import user_state
from sirepo import util
import flask
import flask.sessions
import flask_oauthlib.client
import sqlalchemy

_ANONYMOUS_OAUTH_TYPE = 'anonymous'

# cookie keys for oauth
_COOKIE_NEXT = 'sronx'
_COOKIE_NONCE = 'sronn'


def all_uids():
#TODO(robnagler) do we need locking
    res = set()
    for u in User.query.all():
        res.add(u.uid)
    return res


def allow_cookieless_user():
    user_state.set_default_state(logged_out_as_anonymous=True)


@api_perm.allow_login
def api_oauthAuthorized(oauth_type):
    return _authorized_callback(oauth_type)


@api_perm.allow_cookieless_user
def api_oauthLogin(simulation_type, oauth_type):
    return _authorize(simulation_type, oauth_type)


@api_perm.allow_visitor
def api_oauthLogout(simulation_type):
    return _logout(simulation_type)


def init_apis(app):
    _init(app)
    user_db.init(app, _init_user_model)
    user_state.init_beaker_compat()
    uri_router.register_api_module()
    api_auth.register_login_module()


def set_default_state(logged_out_as_anonymous=False):
    return user_state.set_default_state(logged_out_as_anonymous)


class _FlaskSession(dict, flask.sessions.SessionMixin):
    pass


class _FlaskSessionInterface(flask.sessions.SessionInterface):
    """Emphemeral session for oauthlib.client state

    Without this class, Flask creates a NullSession which can't
    be written to. Flask assumes the session needs to be persisted
    to cookie or a db, which isn't true in our case.
    """
    def open_session(*args, **kwargs):
        return _FlaskSession()

    def save_session(*args, **kwargs):
        pass


def _authorize(simulation_type, oauth_type):
    """Redirects to an OAUTH request for the specified oauth_type ('github').

    If oauth_type is 'anonymous', the current session is cleared.
    """
    oauth_next = '/{}#{}'.format(simulation_type, flask.request.args.get('next', ''))
    if oauth_type == _ANONYMOUS_OAUTH_TYPE:
        user_state.set_anonymous()
        return server.javascript_redirect(oauth_next)
    state = util.random_base62()
    cookie.set_value(_COOKIE_NONCE, state)
    cookie.set_value(_COOKIE_NEXT, oauth_next)
    callback = cfg.github_callback_uri
    if not callback:
        from sirepo import uri_router
        callback = uri_router.uri_for_api(
            'oauthAuthorized',
            dict(oauth_type=oauth_type),
        )
    return _oauth_client(oauth_type).authorize(
        callback=callback,
        state=state,
    )


def _authorized_callback(oauth_type):
    """Handle a callback from a successful OAUTH request. Tracks oauth
    users in a database.
    """
    oc = _oauth_client(oauth_type)
    resp = oc.authorized_response()
    if not resp:
        util.raise_forbidden('missing oauth response')
    state = _remove_cookie_key(_COOKIE_NONCE)
    if state != flask.request.args.get('state', ''):
        util.raise_forbidden(
            'mismatch oauth state: {} != {}',
            state,
            flask.request.args.get('state'),
        )
    # fields: id, login, name
    user_data = oc.get('user', token=(resp['access_token'], '')).data
    user_data['oauth_type'] = oauth_type
    user_db.update_user(User, user_data)
    user_state.set_logged_in(user_data['login'])
    return server.javascript_redirect(_remove_cookie_key(_COOKIE_NEXT))


def _init(app):
    app.session_interface = _FlaskSessionInterface()
    global cfg
    cfg = pkconfig.init(
        github_key=(None, str, 'GitHub application key'),
        github_secret=(None, str, 'GitHub application secret'),
        github_callback_uri=(None, str, 'GitHub application callback URI'),
    )
    if not cfg.github_key or not cfg.github_secret:
        raise RuntimeError('Missing GitHub oauth config')


def _init_user_model(_db):
    """Creates User class bound to dynamic `_db` variable"""
    global User

    class User(_db.Model):
        __tablename__ = 'user_t'
        uid = _db.Column(_db.String(8), primary_key=True)
        user_name = _db.Column(_db.String(100), nullable=False)
        display_name = _db.Column(_db.String(100))
        oauth_type = _db.Column(
            _db.Enum('github', 'test', name='oauth_type'),
            nullable=False
        )
        oauth_id = _db.Column(_db.String(100), nullable=False)
        __table_args__ = (sqlalchemy.UniqueConstraint('oauth_type', 'oauth_id'),)

        def __init__(self, uid, user_data):
            self.uid = uid
            self.user_name = user_data['login']
            self.display_name = user_data['name']
            self.oauth_type = user_data['oauth_type']
            self.oauth_id = user_data['id']

        @classmethod
        def search(cls, user_data):
            return cls.query.filter_by(oauth_id=user_data['id'], oauth_type=user_data['oauth_type']).first()

        def update(self, user_data):
            self.user_name = user_data['login']
            self.display_name = user_data['name']


def _logout(simulation_type):
    """Sets the login_state to logged_out and clears the user session.
    """
    user_state.set_logged_out()
    return flask.redirect('/{}'.format(simulation_type))


def _oauth_client(oauth_type):
    if oauth_type == 'github':
        return flask_oauthlib.client.OAuth(flask.current_app).remote_app(
            'github',
            consumer_key=cfg.github_key,
            consumer_secret=cfg.github_secret,
            base_url='https://api.github.com/',
            request_token_url=None,
            access_token_method='POST',
            access_token_url='https://github.com/login/oauth/access_token',
            authorize_url='https://github.com/login/oauth/authorize',
        )
    raise RuntimeError('Unknown oauth_type: {}'.format(oauth_type))


def _remove_cookie_key(name):
    value = cookie.get_value(name)
    cookie.unchecked_remove(name)
    return value
