# -*- coding: utf-8 -*
from odoo import http, _
import os
from odoo.addons.web.controllers import main as web

import json
import logging

_logger = logging.getLogger(__name__)

class SyncBetweenSessionsController(web.Home):

    def __init__(self):
        super(SyncBetweenSessionsController, self).__init__()
        _logger.info('[__init__] CacheController')
        self.sync_datas = {}

    @http.route('/pos/register/sync', type="json", auth='none', cors='*')
    def register_sync(self, database, config_id, config_ids):
        _logger.info('[register_sync] from Config: %s', config_id)
        if not self.sync_datas.get(database):
            self.sync_datas[database] = {}
        if not self.sync_datas[database].get(config_id, None):
            self.sync_datas[database][config_id] = []
        for send_to_config_id in config_ids:
            if not self.sync_datas[database].get(send_to_config_id, None):
                self.sync_datas[database][send_to_config_id] = []
        values = self.sync_datas.get(database).get(config_id)
        self.sync_datas[database][config_id] = []
        if len(values) > 0:
            _logger.info('[register_sync] Config: %s have total news : %s' % (config_id, len(values)))
        return json.dumps({'state': 'succeed', 'values': values})

    @http.route('/pos/save/sync', type="json", auth='none', cors='*')
    def save_sync(self, database, send_from_config_id, config_ids, message):
        _logger.info('[save_sync] from Config: %s', send_from_config_id)
        if not self.sync_datas.get(database):
            self.sync_datas[database] = {}
        if not self.sync_datas[database].get(send_from_config_id, None):
            self.sync_datas[database][send_from_config_id] = []
        for config_id in config_ids:
            if not self.sync_datas[database].get(config_id, None):
                self.sync_datas[database][config_id] = []
            if config_id != send_from_config_id:
                self.sync_datas[database][config_id].append(message)
            if len(self.sync_datas[database][config_id]) > 2000: # TODO: if total transaction bigger than 2000, will reset to 0
                self.sync_datas[database][config_id] = []
        return json.dumps({'state': 'succeed', 'values': {}})

    @http.route('/pos/passing/login', type='json', auth='none', cors='*')
    def pos_login(self):
        return "ping"

    @http.route('/pos/reboot', type='json', auth='none', cors='*')
    def reboot(self):
        os.system('sudo reboot now')
        return json.dumps({'state': 'succeed', 'values': 'OK'})
