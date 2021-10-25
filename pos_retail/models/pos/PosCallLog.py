# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
from datetime import datetime

import logging
import json

_logger = logging.getLogger(__name__)


class pos_call_log(models.Model):
    _rec_name = "call_model"
    _name = "pos.call.log"
    _description = "Log datas of pos sessions"

    min_id = fields.Integer('Min Id', required=1, index=True, readonly=1)
    max_id = fields.Integer('Max Id', required=1, index=True, readonly=1)
    call_domain = fields.Char('Domain', required=1, index=True, readonly=1)
    call_results = fields.Char('Results', readonly=1)
    call_model = fields.Char('Model', required=1, index=True, readonly=1)
    call_fields = fields.Char('Fields', index=True, readonly=1)
    active = fields.Boolean('Active', default=True)
    write_date = fields.Datetime('Write date', readonly=1)

    def compare_database_write_date(self, model, pos_write_date):
        last_logs = self.search([('call_model', '=', model), ('write_date', '<', pos_write_date)])
        if last_logs:
            _logger.info('POS write date is %s' % pos_write_date)
            _logger.info('Model %s write date is %s' % (model, last_logs[0].write_date))
            return True
        else:
            return False

    def covert_datetime(self, model, datas):  # TODO: function for only 12 and 13
        all_fields = self.env[model].fields_get()
        if all_fields:
            for data in datas:
                for field, value in data.items():
                    if field == 'model':
                        continue
                    if all_fields[field] and all_fields[field]['type'] in ['date', 'datetime'] and value:
                        data[field] = value.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
        return datas

    def refresh_logs(self):
        _logger.info('BEGIN refresh_logs()')
        lastLog = self.env['pos.call.log'].search([], limit=1)
        if lastLog:
            today = datetime.today()
            diffDays = (today - lastLog.write_date).days
            _logger.info('[diffDays] %s' % diffDays)
            if diffDays >= 7:
                self.env['pos.cache.database'].sudo().search([]).unlink()
                logs = self.search([])
                for log in logs:
                    log.refresh_log()
                self.env['pos.session'].sudo().search([
                    ('state', '=', 'opened')
                ]).write({
                    'required_reinstall_cache': True
                })
        _logger.info('END refresh_logs()')
        return True

    @api.model
    def refresh_log(self):
        _logger.info('[BEGIN] refresh_log id %s' % self.id)
        cache_database_object = self.env['pos.cache.database']
        cache_database_object.installing_datas(self.call_model, self.min_id, self.max_id)
        return True


class PosQueryLog(models.Model):
    _name = "pos.query.log"
    _description = "POS Query Log"

    name = fields.Text('Query String', readonly=1)
    results = fields.Char('Query Results', readonly=1)
    write_date = fields.Datetime('Updated date', readonly=1)

    def updateQueryLogs(self, vals):
        queryExisted = self.search([('name', '=', vals.get('key'))], limit=1)
        if not queryExisted:
            _logger.info('New Query saved with key: %s' % vals.get('key'))
            self.create({
                'name': vals.get('key'),
                'results': json.dumps(vals.get('result'))
            })
        else:
            queryExisted.write({
                'results': json.dumps(vals.get('result'))
            })
        return True

    def clearLogs(self):
        self.search([]).unlink()
        return True
