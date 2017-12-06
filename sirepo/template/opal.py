# -*- coding: utf-8 -*-
u"""OPAL execution template.

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""

from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkio
from pykern import pkjinja
from pykern.pkdebug import pkdc, pkdp
from sirepo import simulation_db
from sirepo.template import template_common

SIM_TYPE = 'opal'

def background_percent_complete(report, run_dir, is_running, schema):
    res = {
        'percentComplete': 100,
        'frameCount': 0,
    }
    if is_running:
        data = simulation_db.read_json(run_dir.join(template_common.INPUT_BASE_NAME))
        res['percentComplete'] = '50'
        return res
    return res


def fixup_old_data(data):
    if 'beam' not in data['models']:
        data['models']['beam'] = {
            'particle': 'ELECTRON',
            'mass': 0,
            'charge': 0,
            'bfreq': 1.3e9,
            'bcurrent':0.013,
            'npart': 1500,
        }
        data['models']['distribution'] = {
            'type': 'GAUSS',
        }
        data['models']['bunchReport'] = {
            'x': 'x',
            'y': 'y',
            'histogramBins': 100,
        }


def get_animation_name(data):
    return 'animation'


def lib_files(data, source_lib):
    return []


def models_related_to_report(data):
    r = data['report']
    if r == get_animation_name(data):
        return []
    return ['beam', 'distribution', r]


def python_source_for_model(data, model):
    return ''


def write_parameters(data, schema, run_dir, is_parallel):
    template_common.validate_models(data, schema)
    v = template_common.flatten_data(data['models'], {})
    template_file = 'opal' if is_parallel else 'opal_beam'
    pkio.write_text(
        run_dir.join(template_common.PARAMETERS_PYTHON_FILE),
        pkjinja.render_file(template_common.resource_dir(SIM_TYPE).join('{}.py.jinja'.format(template_file)), v),
    )
