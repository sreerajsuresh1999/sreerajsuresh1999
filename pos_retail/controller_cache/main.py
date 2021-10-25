# -*- coding: utf-8 -*-
##############################################################################
#
#    TL Technology
#    Copyright (C) 2019 ­TODAY TL Technology (<https://www.posodoo.com>).
#    Odoo Proprietary License v1.0 along with this program.
#
##############################################################################

from odoo import http, _
from odoo.addons.web.controllers import main as web

import json
import logging

_logger = logging.getLogger(__name__)

class CacheController(web.Home):

    def __init__(self):
        super(CacheController, self).__init__()
        _logger.info('[__init__] CacheController')
        self.keys = {}

    @http.route('/hw_cache/save', type="json", auth='none', cors='*')
    def saveIotCache(self, key, value):
        _logger.info('[saveIotCache] key %s' % key)
        self.keys[key] = value
        return json.dumps({'state': 'succeed', 'values': {}})

    @http.route('/hw_cache/get', type="json", auth='none', cors='*')
    def getIotCache(self, key):
        _logger.info('[getIotCache] key %s' % key)
        if (self.keys.get(key, None)):
            return self.keys[key]
        else:
            return None

    @http.route('/hw_cache/reset', type="json", auth='none', cors='*')
    def resetIotCache(self):
        _logger.info('[resetIotCache] reset')
        self.keys = {}
        return True

    @http.route('/hw_cache/ping', type='json', auth='none', cors='*')
    def pingCacheServer(self):
        return "ping"
