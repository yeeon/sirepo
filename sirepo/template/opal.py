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
import h5py
import numpy as np

SIM_TYPE = 'opal'

WANT_BROWSER_FRAME_CACHE = True

_OPAL_H5_FILE = 'opal.h5'


def background_percent_complete(report, run_dir, is_running, schema):
    res = {
        'percentComplete': 100,
        'frameCount': 0,
    }
    if is_running:
        data = simulation_db.read_json(run_dir.join(template_common.INPUT_BASE_NAME))
        res['percentComplete'] = '50'
        return res
    if run_dir.join('{}.json'.format(template_common.INPUT_BASE_NAME)).exists():
        #TODO(pjm): hard-coded for mockup
        res['frameCount'] = 101
    return res


def fixup_old_data(data):
    pass


def get_animation_name(data):
    return 'animation'


_FIELD_INDEX = {
    'x': 0,
    'y': 1,
    'z': 2,
}

_FIELD_UNITS = {
    'SPOS': 'm',
    'TIME': 's',
    'ENERGY': 'MeV',
    'dE': 'MeV',
    'MASS': 'GeV',
    'CHARGE': 'C',
    'spos-head': 'm',
    'spos-ref': 'm',
    'spos-tail': 'm',
    'RefPartR': 'm',
    'RMSX': 'm',
    'RefPartP': 'βγ',
    'RMSP': 'βγ',
    '#varepsilon': 'mrad',
    '#varepsilon-geom': 'mrad',
    'B-ref': 'T',
    'E-ref': 'MV/m',
    'B-head': 'T',
    'E-head': 'MV/m',
    'B-tail': 'T',
    'E-tail': 'MV/m',
}

_FIELD_LABEL = {
    '#varepsilon': 'ε',
    '#varepsilon-geom': 'ε-geom',
    '#sigma': 'σ',
}

def _field_info(field):
    info = field.split(' ')
    suffix = ''
    if len(info) == 1:
        info.append(0)
    else:
        suffix = info[1]
        info[1] = _FIELD_INDEX[info[1]]
    info.append(info[0])
    if info[0] in _FIELD_LABEL:
        info[2] = _FIELD_LABEL[info[0]]
    if suffix:
        info[2] = '{}({})'.format(info[2], suffix)
    info.append('')
    if info[0] in _FIELD_UNITS:
        info[3] = ' [{}]'.format(_FIELD_UNITS[info[0]])
    return info


def get_simulation_frame(run_dir, data, model_data):
    if data['modelName'] in ('plot1Animation', 'plot2Animation'):
        return _extract_plot(run_dir, data)
    if data['modelName'] == 'bunchAnimation':
        return _extract_bunch(run_dir, data)
    raise RuntimeError('{}: unknown simulation frame model'.format(data['modelName']))


def lib_files(data, source_lib):
    return []


def models_related_to_report(data):
    r = data['report']
    if r == get_animation_name(data):
        return []
    return ['beam', 'distribution', r]


def python_source_for_model(data, model):
    return _generate_parameters_file(data, is_parallel=True) + '''
with open('opal.in', 'w') as f:
    f.write(input_file)

import os
os.system('opal opal.in')
'''


def write_parameters(data, schema, run_dir, is_parallel):
    template_common.validate_models(data, schema)
    pkio.write_text(
        run_dir.join(template_common.PARAMETERS_PYTHON_FILE),
        _generate_parameters_file(data, is_parallel),
    )


def _extract_bunch(run_dir, data):
    frame_index = int(data['frameIndex'])
    frame_data = template_common.parse_animation_args(
        data,
        {
            '': ['x', 'y', 'histogramBins', 'startTime'],
        },
    )
    with h5py.File(str(run_dir.join(_OPAL_H5_FILE)), 'r') as f:
        x = np.array(f['/Step#{}/{}'.format(frame_index, frame_data['x'])])
        y = np.array(f['/Step#{}/{}'.format(frame_index, frame_data['y'])])
        bins = frame_data['histogramBins']
        hist, edges = np.histogramdd([x, y], template_common.histogram_bins(bins))
    return {
        'x_range': [float(edges[0][0]), float(edges[0][-1]), len(hist)],
        'y_range': [float(edges[1][0]), float(edges[1][-1]), len(hist[0])],
        'x_label': _label(frame_data['x']),
        'y_label': _label(frame_data['y']),
        'title': '',
        'z_matrix': hist.T.tolist(),
    }


def _extract_plot(run_dir, data):
    frame_data = template_common.parse_animation_args(
        data,
        {
            '': ['x_field', 'y1_field', 'y2_field', 'startTime'],
        },
    )
    info = {
        'x': _field_info(frame_data['x_field']),
        'y1': _field_info(frame_data['y1_field']),
        'y2': _field_info(frame_data['y2_field']),
    }
    x = []
    y1 = []
    y2 = []
    with h5py.File(str(run_dir.join(_OPAL_H5_FILE)), 'r') as f:
        step = 0
        key = 'Step#{}'.format(step)
        while key in f:
            x.append(f[key].attrs[info['x'][0]][info['x'][1]])
            y1.append(f[key].attrs[info['y1'][0]][info['y1'][1]])
            y2.append(f[key].attrs[info['y2'][0]][info['y2'][1]])
            step += 1
            key = 'Step#{}'.format(step)
    y1_extent = [min(y1), max(y1)]
    y2_extent = [min(y2), max(y2)]
    plots = [
        {
            'points': y1,
            'color': 'steelblue',
            'label': info['y1'][2],
        },
    ]
    if frame_data['y1_field'] != frame_data['y2_field']:
        plots.append({
            'points': y2,
            'color': '#ff7f0e',
            'label': info['y2'][2],
        })
    return {
        'title': '',
        'x_range': [x[0], x[-1]],
        'y_label': info['y1'][3] if info['y1'][3] == info['y2'][3] else '',
        'x_label': '{}{}'.format(info['x'][2], info['x'][3]),
        'x_points': x,
        'y_range': [min(y1_extent[0], y2_extent[0]), max(y1_extent[1], y2_extent[1])],
        'plots': plots,
    }


def _generate_parameters_file(data, is_parallel):
    v = template_common.flatten_data(data['models'], {})
    template_file = 'opal' if is_parallel else 'opal_beam'
    return pkjinja.render_resource('template/opal/{}.py'.format(template_file), v)


#TODO(pjm): copied from pkcli/opal.py
def _label(field):
    if field in ('x', 'y', 'z'):
        return '{} [m]'.format(field)
    #TODO(pjm): need units for px, py, ... fields?
    return '{} [ ]'.format(field)
