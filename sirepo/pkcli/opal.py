# -*- coding: utf-8 -*-
"""Wrapper to run opal from the command line.

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkio
from pykern import pksubprocess
from pykern.pkdebug import pkdp, pkdc
from sirepo import simulation_db
from sirepo.template import template_common
import h5py
import numpy as np
import sirepo.template.opal as template

_SCHEMA = simulation_db.get_schema(template.SIM_TYPE)


def run(cfg_dir):
    with pkio.save_chdir(cfg_dir):
        data = simulation_db.read_json(template_common.INPUT_BASE_NAME)
        model = data['models'][data['report']]
        _run_opal()
        with h5py.File('opal.h5', 'r') as f:
            x = np.array(f['/Step#0/{}'.format(model['x'])])
            y = np.array(f['/Step#0/{}'.format(model['y'])])
            bins = model['histogramBins']
            hist, edges = np.histogramdd([x, y], template_common.histogram_bins(bins))
        res = {
            'x_range': [float(edges[0][0]), float(edges[0][-1]), len(hist)],
            'y_range': [float(edges[1][0]), float(edges[1][-1]), len(hist[0])],
            'x_label': _label(model['x']),
            'y_label': _label(model['y']),
            #TODO(pjm): report title, similar to elegant bunch report
            'title': '',
            'z_matrix': hist.T.tolist(),
        }
        simulation_db.write_result(res)


def run_background(cfg_dir):
    """Run elegant as a background task

    Args:
        cfg_dir (str): directory to run elegant in
    """
    with pkio.save_chdir(cfg_dir):
        _run_opal()
        simulation_db.write_result({})


def _label(field):
    if field in ('x', 'y', 'z'):
        return '{} [m]'.format(field)
    #TODO(pjm): need units for px, py, ... fields?
    return '{} [ ]'.format(field)


def _run_opal():
    exec(pkio.read_text(template_common.PARAMETERS_PYTHON_FILE), locals(), locals())
    opal_input_file = 'opal.in'
    pkio.write_text(opal_input_file, input_file)
    pksubprocess.check_call_with_signals(['opal', opal_input_file], msg=pkdp)
