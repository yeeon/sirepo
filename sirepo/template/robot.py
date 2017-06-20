# -*- coding: utf-8 -*-
u"""Robot execution template.

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
import dicom
import numpy as np
import os.path
import py.path
import werkzeug
import zipfile

SIM_TYPE = 'robot'

WANT_BROWSER_FRAME_CACHE = True

_DICOM_DIR = 'dicom'
_DICOM_MIN_VALUE = -1250
_DICOM_MAX_VALUE = 2000
_ROI_FILE_NAME = 'rs4pi-roi-data.json'
_TMP_INPUT_FILE_FIELD = 'tmpDicomFilePath'
_ZIP_FILE_NAME = 'input.zip'

def background_percent_complete(report, run_dir, is_running, schema):
    data_path = run_dir.join(template_common.INPUT_BASE_NAME)
    if not os.path.exists(str(simulation_db.json_filename(data_path))):
        return {
            'percentComplete': 0,
            'frameCount': 0,
        }
    return {
        'percentComplete': 100,
        # real frame count depends on the series selected
        'frameCount': 1,
        'errors': '',
    }


def copy_related_files(data, source_path, target_path):
    py.path.local(source_path).join(_DICOM_DIR).copy(py.path.local(target_path))


def fixup_old_data(data):
    pass


def get_animation_name(data):
    return 'animation'


def _read_roi_file(sim_id):
    return simulation_db.read_json(
        simulation_db.simulation_dir(SIM_TYPE, sim_id).join(_ROI_FILE_NAME))


def get_application_data(data):
    if data['method'] == 'roi_points':
        return _read_roi_file(data['simulationId'])
    else:
        raise RuntimeError('{}: unknown application data method'.format(data['method']))


def get_simulation_frame(run_dir, data, model_data):
    frame_index = int(data['frameIndex'])
    args = data['animationArgs'].split('_')
    if data['modelName'].startswith('dicomAnimation'):
        # #series = _find_series_by_number(model_data, args[0])
        # plan = dicom.read_file(
        #     _dicom_path(
        #         model_data['models']['simulation'],
        #         't' + str(frame_index).zfill(5) + '.json'))
        #         #series['instances'][frame_index]['filePath']))
        # pixels = np.int32(plan.pixel_array)
        # _scale_pixel_data(plan, pixels)
        # shape = pixels.shape
        # res = {
        #     'histogram': _histogram_from_pixels(pixels),
        #     'pixel_array': pixels.tolist(),
        #     'shape': shape,
        #     # mm
        #     'extents': [pixels.min().tolist(), pixels.max().tolist()],
        #     'ImagePositionPatient': _float_list(plan.ImagePositionPatient),
        #     'ImageOrientationPatient': _float_list(plan.ImageOrientationPatient),
        #     # mm
        #     'PixelSpacing': _float_list(plan.PixelSpacing),
        #     # mm
        #     #'SliceThickness': float(plan.SliceThickness),
        #     'WindowCenter': int(_first_dicom_value_or_deault(plan, 'WindowCenter', '40')),
        #     'WindowWidth': int(_first_dicom_value_or_deault(plan, 'WindowWidth', '400')),
        #     'PatientPosition': plan.PatientPosition,
        #     'SeriesNumber': plan.SeriesNumber,
        #     'StudyInstanceUID': plan.StudyInstanceUID,
        #     'SeriesInstanceUID': plan.SeriesInstanceUID,
        #     'SOPInstanceUID': plan.SOPInstanceUID,
        # }
        # res['domain'] = _calculate_domain(_position_matrix(res), shape)
        # pkdp('domain: {}', res['domain'])
        # return res
        return simulation_db.read_json(_dicom_path(model_data['models']['simulation'], args[0] + str(frame_index).zfill(5)))
    raise RuntimeError('{}: unknown simulation frame model'.format(data['modelName']))


def import_file(request, lib_dir=None, tmp_dir=None):
    f = request.files['file']
    filename = werkzeug.secure_filename(f.filename)
    if not pkio.has_file_extension(str(filename), 'zip'):
        raise RuntimeError('unsupported import filename: {}'.format(filename))
    filepath = str(tmp_dir.join(_ZIP_FILE_NAME))
    f.save(filepath)
    data = simulation_db.default_data(SIM_TYPE)
    data['models']['simulation']['name'] = filename
    data['models']['simulation'][_TMP_INPUT_FILE_FIELD] = filepath
    # more processing occurs below in prepare_for_client() after simulation dir is prepared
    return data


def lib_files(data, source_lib):
    return template_common.internal_lib_files([], source_lib)


def models_related_to_report(data):
    return []


def new_simulation(data, new_simulation_data):
    pass


def prepare_aux_files(run_dir, data):
    template_common.copy_lib_files(data, None, run_dir)


def prepare_for_client(data):
    if _TMP_INPUT_FILE_FIELD in data['models']['simulation']:
        _move_import_file(data)
    return data


def prepare_for_save(data):
    return data


def remove_last_frame(run_dir):
    pass


def resource_files():
    return []


def write_parameters(data, schema, run_dir, is_parallel):
    pass


def _calculate_domain(matrix, shape):
    return [
        np.dot(matrix, [0, 0, 0, 1]).tolist(),
        np.dot(matrix, [shape[1], shape[0], 0, 1]).tolist(),
    ]


def _dicom_dir(simulation):
    sim_dir = simulation_db.simulation_dir(SIM_TYPE, simulation['simulationId'])
    return str(sim_dir.join(_DICOM_DIR))


def _dicom_path(simulation, path):
    return str(py.path.local(_dicom_dir(simulation)).join(path))


# def _find_series_by_number(data, series_number):
#     study = data['models']['studies'][0]
#     for series in study['series']:
#         if str(series_number) == str(series['number']):
#             return series
#     raise RuntimeError('series number not found: {}'.format(series_number))


def _first_dicom_value_or_deault(plan, field, default_value):
    if hasattr(plan, field):
        v = getattr(plan, field)
        if isinstance(v, list):
            return v[0]
        return v
    return default_value


def _float_list(ar):
    return map(lambda x: float(x), ar)


def _string_list(ar):
    return map(lambda x: str(x), ar)


def _histogram_from_pixels(pixels):
    m = 50
    extent = [pixels.min(), pixels.max()]
    if extent[0] < _DICOM_MIN_VALUE:
        extent[0] = _DICOM_MIN_VALUE
    if extent[1] > _DICOM_MAX_VALUE:
        extent[1] = _DICOM_MAX_VALUE
    span = extent[1] - extent[0]
    step = np.power(10, np.floor(np.log(span / m) / np.log(10)))
    err = float(m) / span * step
    if err <= .15:
        step *= 10
    elif err <= .35:
        step *= 5
    elif err <= .75:
        step *= 2
    e = [
        np.ceil(extent[0] / step) * step,
        np.floor(extent[1] / step) * step + step * .5,
        step,
    ]
    bins = np.ceil((e[1] - e[0]) / e[2])
    hist, edges = np.histogram(pixels, bins=bins, range=[e[0], e[0] + (bins - 1) * step])
    if hist[0] == hist.max():
        v = hist[0]
        hist[0] = 0
        if v > hist.max() * 2:
            hist[0] = hist.max() * 2
        else:
            hist[0] = v
    return {
        'histogram': hist.tolist(),
        'extent': [edges[0], edges[-1], bins],
    }


def _move_import_file(data):
    sim = data['models']['simulation']
    path = sim[_TMP_INPUT_FILE_FIELD]
    del sim[_TMP_INPUT_FILE_FIELD]
    if os.path.exists(path):
        zip_path = _zip_path(sim)
        os.rename(path, zip_path)
        pkio.unchecked_remove(os.path.dirname(path))
        dicom_dir = _dicom_dir(sim)
        zipfile.ZipFile(zip_path).extractall(dicom_dir)
        _summarize_dicom_files(data, dicom_dir)
        simulation_db.save_simulation_json(SIM_TYPE, data)


def _position_matrix(data):
    orientation = data['ImageOrientationPatient']
    spacing = data['PixelSpacing']
    position = _float_list(data['ImagePositionPatient'])
    return [
        [orientation[0] * spacing[0], orientation[3] * spacing[1], 0, position[0]],
        [orientation[1] * spacing[0], orientation[4] * spacing[1], 0, position[1]],
        [orientation[2] * spacing[0], orientation[5] * spacing[1], 0, position[2]],
        [0, 0, 0, 1],
    ]


def _scale_pixel_data(plan, pixels):
    scale_required = False
    slope = 1
    offset = 0
    if 'RescaleSlope' in plan and plan.RescaleSlope != slope:
        slope = plan.RescaleSlope
        scale_required = True
    if 'RescaleIntercept' in plan and plan.RescaleIntercept != offset:
        offset = plan.RescaleIntercept
        scale_required = True
    #data = plan.pixel_array
    #pkdp('data dtype: {}', pixels.dtype)
    if scale_required:
        pixels *= slope
        pixels += offset
    return

CT_DICOM_CLASS = '1.2.840.10008.5.1.4.1.1.2'
RTSTRUCT_DICOM_CLASS = '1.2.840.10008.5.1.4.1.1.481.3'
_EXPECTED_ORIENTATION = np.array([1, 0, 0, 0, 1, 0])

def _summarize_dicom_files(data, dicom_dir):
    dicomFrames = []
    for path in pkio.walk_tree(dicom_dir):
        if pkio.has_file_extension(str(path), 'dcm'):
            plan = dicom.read_file(str(path))
            if plan.SOPClassUID == RTSTRUCT_DICOM_CLASS:
                #pkdp('import dicom rt struct')
                _summarize_rt_structure(data['models']['simulation'], plan)
                #pkdp('done import dicom rt struct')
            if plan.SOPClassUID != CT_DICOM_CLASS:
                continue
            orientation = _float_list(plan.ImageOrientationPatient)
            if not (_EXPECTED_ORIENTATION == orientation).all():
                continue
            #pkdp('import dicom ct')
            m = {
                'path': path,
                'plan': plan,
            }
            for f in ('StudyInstanceUID', 'StudyDescription', 'SeriesInstanceUID', 'SeriesDescription', 'SeriesNumber', 'SOPInstanceUID', 'InstanceNumber', 'ImagePositionPatient'):
                if hasattr(plan, f):
                    #TODO(pjm): need a required and optional list
                    m[f] = getattr(plan, f)
                else:
                    m[f] = ''
            dicomFrames.append(m)

    studies = {}
    for f in dicomFrames:
        if f['StudyInstanceUID'] not in studies:
            studies[f['StudyInstanceUID']] = {}
        series = studies[f['StudyInstanceUID']]
        if f['SeriesInstanceUID'] not in series:
            series[f['SeriesInstanceUID']] = []
        series[f['SeriesInstanceUID']].append(f)
        # if isRTStructureByZPosition:
        #     z_position = f['ImagePositionPatient'][2]
        #     #pkdp('z_position: {}', z_position)
        #     regions = data.models.regionsOfInterest
        #     keys = regions.keys()
        #     for k in keys:
        #         value = regions[k]
        #         if z_position in value['contour']:
        #             pkdp('remap z to uid: {} -> {}', z_position, f['SOPInstanceUID'])
        #             value['contour'][f['SOPInstanceUID']] = value['contour'][z_position]
        #             del value['contour'][z_position]


    if not len(studies.keys()):
        raise RuntimeError('No series found with {} orientation'.format(_EXPECTED_ORIENTATION))
    res = []

    for study_id in studies:
        study = None
        for series_id in studies[study_id]:
            series = None
            for f in sorted(studies[study_id][series_id], key=lambda frame: frame['InstanceNumber']):
                if not study:
                    study = {
                        'description': f['StudyDescription'],
                        'series': [],
                    }
                    res.append(study)
                assert study['description'] == f['StudyDescription']
                if not series:
                    series = {
                        'description': f['SeriesDescription'],
                        'number': f['SeriesNumber'],
                        'instances': [],
                    }
                    study['series'].append(series)
                assert series['description'] == f['SeriesDescription']
                assert series['number'] == f['SeriesNumber']
                series['instances'].append({
                    'filePath': f['path'],
                    'plan': f['plan'],
                })
    #TODO(pjm): give user a choice between multiple study/series if present
    series = res[0]['series'][0]
    all_pixels = _summarize_dicom_series(data['models']['simulation'], series)
    data['models']['dicomSeries'] = {
        'description': series['description'],
        'planes': {
            't': {
                'frameIndex': 0,
                'frameCount': len(all_pixels),
            },
            's': {
                'frameIndex': 0,
                'frameCount': len(all_pixels[0]),
            },
            'c': {
                'frameIndex': 0,
                'frameCount': len(all_pixels[0]),
            },
        }
    }
    all_histogram = _histogram_from_pixels(all_pixels)
    pkdp(all_histogram)
    simulation = data['models']['simulation']
    filename = str(simulation_db.simulation_dir(SIM_TYPE, simulation['simulationId']).join(_ROI_FILE_NAME))
    if os.path.exists(filename):
        roi_data = _read_roi_file(simulation['simulationId'])
    else:
        roi_data = {
            'models': {
                'regionsOfInterest': {},
            },
        }
    roi_data['models']['dicomHistogram'] = all_histogram
    simulation_db.write_json(filename, roi_data)

    # data['models']['studies'] = res
    # if res[0]['description']:
    #     data['models']['simulation']['name'] = res[0]['description']
    # data['models']['dicomAnimation']['seriesNumber'] = res[0]['series'][0]['number']
    # data['models']['dicomAnimation2']['seriesNumber'] = res[0]['series'][0]['number']


def _summarize_dicom_series(simulation, series):
    idx = 0
    all_frame_pixels = []
    first_pos = None
    last_pos = None
    last_res = None
    for instance in series['instances']:
        #pkdp('filepath: {}'.format(instance['filePath']))
        plan = instance['plan']
        pixels = np.int32(plan.pixel_array)
        _scale_pixel_data(plan, pixels)
        all_frame_pixels.append(pixels)
        shape = pixels.shape
        res = {
            'pixel_array': pixels.tolist(),
            'shape': shape,
            'ImagePositionPatient': _string_list(plan.ImagePositionPatient),
            'ImageOrientationPatient': _float_list(plan.ImageOrientationPatient),
            'PixelSpacing': _float_list(plan.PixelSpacing),
        }
        res['domain'] = _calculate_domain(_position_matrix(res), shape)
        if not first_pos:
            first_pos = res['domain']
        last_pos = res['domain']
        last_res = res
        filename = _dicom_path(simulation, 't' + str(idx).zfill(5))
        simulation_db.write_json(filename, res)
        idx += 1

    for idx in range(len(all_frame_pixels[0])):
        pixels = np.array(all_frame_pixels)[:, idx]
        shape = pixels.shape
        res = {
            'pixel_array': np.flipud(pixels).tolist(),
            'shape': shape,
            'ImagePositionPatient': [res['ImagePositionPatient'][0], res['ImagePositionPatient'][1], str(idx * res['PixelSpacing'][0])],
            'ImageOrientationPatient': res['ImageOrientationPatient'],
            #TODO(pjm): determin from distance between frames
            'PixelSpacing': [res['PixelSpacing'][0], 1.50217533112],
        }
        res['domain'] = _calculate_domain(_position_matrix(res), shape)
        if not first_pos:
            first_pos = res['domain']
        last_pos = res['domain']
        filename = _dicom_path(simulation, 'c' + str(idx).zfill(5))
        simulation_db.write_json(filename, res)

    #TODO(pjm): refactor into one common method
    for idx in range(len(all_frame_pixels[0])):
        pixels = np.array(all_frame_pixels)[:, :, idx]
        shape = pixels.shape
        res = {
            'pixel_array': np.flipud(pixels).tolist(),
            'shape': shape,
            'ImagePositionPatient': [res['ImagePositionPatient'][0], res['ImagePositionPatient'][1], str(idx * res['PixelSpacing'][0])],
            'ImageOrientationPatient': res['ImageOrientationPatient'],
            #TODO(pjm): fix this, as above
            'PixelSpacing': [res['PixelSpacing'][0], 1.50217533112],
        }
        res['domain'] = _calculate_domain(_position_matrix(res), shape)
        if not first_pos:
            first_pos = res['domain']
        last_pos = res['domain']
        filename = _dicom_path(simulation, 's' + str(idx).zfill(5))
        simulation_db.write_json(filename, res)

    return np.array(all_frame_pixels)


def _summarize_rt_structure(simulation, plan):
    data = {
        'models': {},
    }
    res = data['models']['regionsOfInterest'] = {}
    for roi in plan.StructureSetROISequence:
        res[roi.ROINumber] = {
            'name': roi.ROIName,
        }
    for roi_contour in plan.ROIContourSequence:
        roi = res[roi_contour.ReferencedROINumber]
        if 'contour' in roi:
            raise RuntimeError('duplicate contour sequence for roi')
        if not hasattr(roi_contour, 'ContourSequence'):
            continue
        roi['color'] = roi_contour.ROIDisplayColor
        roi['contour'] = {}
        for contour in roi_contour.ContourSequence:
            if contour.ContourGeometricType != 'CLOSED_PLANAR':
                continue
            if len(contour.ContourData):
                # the z index is the key
                ct_id = str(contour.ContourData[2])
                contour_data = _float_list(contour.ContourData)
                if len(contour_data) > 3 and float(ct_id) != contour_data[5]:
                    raise RuntimeError('expected contour data z to be equal')
                del contour_data[2::3]
                if ct_id not in roi['contour']:
                    roi['contour'][ct_id] = []
                roi['contour'][ct_id].append(contour_data)
    filename = str(simulation_db.simulation_dir(SIM_TYPE, simulation['simulationId']).join(_ROI_FILE_NAME))
    simulation_db.write_json(filename, data)


def _zip_path(simulation):
    sim_dir = simulation_db.simulation_dir(SIM_TYPE, simulation['simulationId'])
    return str(sim_dir.join(_ZIP_FILE_NAME))
