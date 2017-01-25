# -*- coding: utf-8 -*-
u"""Codec for binary attribute values.

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
import six

_ESCAPE_CHAR = b'\\'

_DECODE = {
    b'0': _ESCAPE_CHAR,
    b'1': b'\0',
    b'2': b'"',
    b'3': b'\r',
    b'4': b'\n',
}

_ENCODE = dict([(v, _ESCAPE_CHAR + k) for k, v in _DECODE.items()])


def bin_attr_decode(bin_str):
    """Convert HTML attribute value as binary str

    Args:
        bin_str (six.binary_type): to decode

    Returns:
        six.binary_type: decoded str
    """
    assert isinstance(bin_str, six.binary_type)
    res = b''
    i = 0
    while i < len(bin_str):
        c = bin_str[i]
        if c == _ESCAPE_CHAR:
            i += 1
            c = bin_str[i]
            res += _DECODE[c]
        else:
            res += c
        i += 1
    return res


def bin_attr_encode(bin_str):
    """Convert binary string to HTML attribute value

    Args:
        bin_str (six.binary_type): to encode

    Returns:
        six.binary_type: encoded str
    """
    assert isinstance(bin_str, six.binary_type)
    res = b''
    for c in bin_str:
        res += _ENCODE[c] if c in _ENCODE else c
    return res
