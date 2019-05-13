# -*- coding: utf-8 -*-
u"""Handles dispatching of uris to server.api_* functions

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkinspect
from pykern.pkdebug import pkdc, pkdexc, pkdlog, pkdp
from sirepo import cookie
from sirepo import api_auth
from sirepo import util
import flask
import importlib
import inspect
import re

#: route for sirepo.srunit
srunit_uri = None

#: optional parameter that consumes rest of parameters
_PATH_INFO_CHAR = '*'

#: route parsing
_PARAM_RE = re.compile(r'^([\?\*]?)<(.+?)>$')

#: prefix for api functions
_FUNC_PREFIX = 'api_'

#: Where to route when no routes match (root)
_default_route = None

#: When there is no uri (homePage)
_empty_route = None

#: dict of base_uri to route (base_uri, func, name, decl_uri, params)
_uri_to_route = None

#: dict of base_uri to route (base_uri, func, name, decl_uri, params)
_api_to_route = None

#: modules which support APIs
_api_modules = []

#: functions which implement APIs
_api_funcs = pkcollections.Dict()


class NotFound(Exception):
    """Raised to indicate page not found exception (404)"""
    def __init__(self, log_fmt, *args, **kwargs):
        super(NotFound, self).__init__()
        self.log_fmt = log_fmt
        self.args = args
        self.kwargs = kwargs


def init(app, uwsgi):
    """Convert route map to dispatchable callables

    Initializes `_uri_to_route` and adds a single flask route (`_dispatch`) to
    dispatch based on the map.

    Args:
        app (Flask): flask app
        uwsgi (WSGIApp): uwsgi server object (or None)
    """
    from sirepo import feature_config
    from sirepo import simulation_db

    if _uri_to_route:
        return
    cookie.init_module(app, uwsgi)
    for m in ('server',) + feature_config.cfg.api_modules:
        importlib.import_module('sirepo.' + m).init_apis(app)
    _init_uris(app, simulation_db)


def register_api_module():
    """Add caller_module to the list of modules which implements apis.

    The module must have methods: api_XXX which do not collide with
    other apis.
    """
    m = pkinspect.caller_module()
    assert not m in _api_modules, \
        'module is a duplicate: module={}'.format(m.__name__)
    _api_modules.append(m)
    for n, o in inspect.getmembers(m):
        if n.startswith(_FUNC_PREFIX) and inspect.isfunction(o):
            assert not n in _api_funcs, \
                'function is duplicate: func={} module={}'.format(n, m.__name__)
            _api_funcs[n] = o


def uri_for_api(api_name, params=None, external=True):
    """Generate uri for api method

    Args:
        api_name (str): full name of api
        params (str): paramters to pass to uri
        external (bool): external uri? [True]

    Returns:
        str: formmatted external URI
    """
    import urllib

    r = _api_to_route[api_name]
    res = (flask.url_for('_dispatch_empty', _external=external) + r.base_uri).rstrip('/')
    for p in r.params:
        if p.name in params:
            v = params[p.name]
            if not v is None and len(v) > 0:
                if not (p.is_path_info and v.startwith('/')):
                    res += '/'
                res += v
                continue
        assert p.is_optional, \
            'missing parameter={} for api={}'.format(p.name, api_name)
    return res


def format_uri(simulation_type, application_mode, simulation_id, app_schema):
    local_routes = app_schema['localRoutes']
    app_modes = app_schema['appModes']
    local_route = app_modes[application_mode]['localRoute']
    assert local_route in local_routes
    return '/{}#/{}/{}'.format(
        simulation_type,
        app_modes[application_mode]['localRoute'],
        simulation_id, application_mode) + \
           ('?application_mode={}'.format(application_mode) if app_modes[application_mode][
               'includeMode'] else ''
            )


def _dispatch(path):
    """Called by Flask and routes the base_uri with parameters

    Args:
        path (str): what to route

    Returns:
        Flask.response
    """
    cookie.init()
    try:
        if path is None:
            return _dispatch_call(_empty_route.func, {})
        # werkzeug doesn't convert '+' to ' '
        parts = re.sub(r'\+', ' ', path).split('/')
        try:
            route = _uri_to_route[parts[0]]
            parts.pop(0)
        except KeyError:
            route = _default_route
        kwargs = pkcollections.Dict()
        for p in route.params:
            if not parts:
                if not p.is_optional:
                    raise NotFound('{}: uri missing parameter ({})', path, p.name)
                break
            if p.is_path_info:
                kwargs[p.name] = '/'.join(parts)
                parts = None
                break
            kwargs[p.name] = parts.pop(0)
        if parts:
            raise NotFound('{}: unknown parameters in uri ({})', parts, path)
        return _dispatch_call(route.func, kwargs)
    except NotFound as e:
        util.raise_not_found(e.log_fmt, *e.args, **e.kwargs)
    except Exception as e:
        pkdlog('{}: error: {}', path, pkdexc())
        raise


def _dispatch_call(func, kwargs):
    api_auth.assert_api_call(func)
    resp = flask.make_response(func(**kwargs))
    cookie.save_to_cookie(resp)
    return resp


def _dispatch_empty():
    """Hook for '/' route"""
    return _dispatch(None)


def _init_uris(app, simulation_db):
    global _default_route, _empty_route, srunit_uri, _api_to_route, _uri_to_route

    _uri_to_route = pkcollections.Dict()
    _api_to_route = pkcollections.Dict()
    for k, v in simulation_db.SCHEMA_COMMON.route.items():
        r = _split_uri(v)
        try:
            r.func = _api_funcs[_FUNC_PREFIX + k]
        except KeyError:
            pkdc('not adding api, because module not registered: uri={}', v)
            continue
        api_auth.assert_api_def(r.func)
        r.decl_uri = v
        r.name = k
        assert not r.base_uri in _uri_to_route, \
            '{}: duplicate end point; other={}'.format(v, _uri_to_route[r.base_uri])
        _uri_to_route[r.base_uri] = r
        _api_to_route[k] = r
        if r.base_uri == '':
            _default_route = r
        if 'srunit' in v:
            srunit_uri = v
    assert _default_route, \
        'missing default route'
    _empty_route = _uri_to_route.en
    app.add_url_rule('/<path:path>', '_dispatch', _dispatch, methods=('GET', 'POST'))
    app.add_url_rule('/', '_dispatch_empty', _dispatch_empty, methods=('GET', 'POST'))


def _split_uri(uri):
    """Parse the URL for parameters

    Args:
        uri (str): full path with parameter args in flask format

    Returns:
        Dict: with base_uri, func, params, etc.
    """
    parts = uri.split('/')
    assert '' == parts.pop(0)
    params = []
    res = pkcollections.Dict(params=params)
    in_optional = None
    in_path_info = None
    first = None
    for p in parts:
        assert not in_path_info, \
            'path_info parameter={} must be last: next={}'.format(rp.name, p)
        m = _PARAM_RE.search(p)
        if not m:
            assert first is None, \
                '{}: too many non-parameter components of uri'.format(uri)
            first = p
            continue
        rp = pkcollections.Dict()
        params.append(rp)
        rp.is_optional = bool(m.group(1))
        if rp.is_optional:
            rp.is_path_info = m.group(1) == _PATH_INFO_CHAR
            in_path_info = rp.is_path_info
        else:
            rp.is_path_info = False
        rp.name = m.group(2)
        if rp.is_optional:
            in_optional = True
        else:
            assert not in_optional, \
                '{}: optional parameter ({}) followed by non-optional'.format(
                    uri,
                    rp.name,
                )
    res.base_uri = first or ''
    return res
