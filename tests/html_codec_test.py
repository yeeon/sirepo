# -*- coding: utf-8 -*-
u"""Encode binary

:copyright: Copyright (c) 2017 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
import pytest

def test_bin_attr():
    from sirepo import html_codec
    from pykern.pkunit import pkeq

    for decoded, encoded in (
        (b'\\\0"\r\n', b'\\0\\1\\2\\3\\4'),
        (b'', b''),
        (b'a', b'a'),
    ):
        pkeq(decoded, html_codec.bin_attr_decode(encoded))
        pkeq(encoded, html_codec.bin_attr_encode(decoded))
