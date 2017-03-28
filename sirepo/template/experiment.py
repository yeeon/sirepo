from __future__ import absolute_import, division, print_function
from pykern import pkcollections
from pykern import pkio
from pykern import pkjinja
from pykern.pkdebug import pkdc, pkdp
from sirepo import simulation_db
from sirepo.template import template_common
import os.path
import py.path
import xraylib

#: Simulation type
SIM_TYPE = 'experiment'
_RESOURCE_DIR = template_common.resource_dir(SIM_TYPE)



def fixup_old_data(data):
    pass


def lib_files(data, source_lib):
    res = []
    return template_common.internal_lib_files(res, source_lib)


def new_simulation(data, new_simulation_data):
    pass


def prepare_aux_files(run_dir, data):
    _copy_lib_files(
        data,
        simulation_db.simulation_lib_dir(SIM_TYPE),
        run_dir,
    )


def prepare_for_client(data):
    return data


def prepare_for_save(data):
    return data

def resource_files():
    return pkio.sorted_glob(_RESOURCE_DIR.join('*.txt'))

def _copy_lib_files(data, source_lib, target):
    for f in lib_files(data, source_lib):
        path = target.join(f.basename)
        if not path.exists():
            f.copy(path)
