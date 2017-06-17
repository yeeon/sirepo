# -*- coding: utf-8 -*-
"""Wrapper to run Robot from the command line.

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkio
from pykern.pkdebug import pkdp, pkdc
from sirepo import simulation_db
from sirepo.template import template_common
import sirepo.template.robot as template


def run(cfg_dir):
    raise RuntimeError('not implemented')


def run_background(cfg_dir):
    """Run fete in ``cfg_dir`` with mpi

    Args:
        cfg_dir (str): directory to run fete in
    """
    with pkio.save_chdir(cfg_dir):
        simulation_db.write_result({})
