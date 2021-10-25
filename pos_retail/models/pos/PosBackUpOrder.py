# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import json
import logging

_logger = logging.getLogger(__name__)


class PosOrderLog(models.Model):
    _name = "pos.order.log"
    _inherit = ['portal.mixin', 'mail.thread', 'mail.activity.mixin', 'utm.mixin']
    _description = "Tracking Action of Order"
    _order = 'create_date, name'

    name = fields.Char('Order Number Ref (uid)', required=1, readonly=1)
    order_json = fields.Text('Order Json', readonly=1)
    action = fields.Char(
        'Action',
        help='What POS User action on Order',
        required=1,
        readonly=1,
        tracking=3
    )
    create_date = fields.Datetime('Action Date', required=1, readonly=1)
    write_date = fields.Datetime('Write date', readonly=1)
    config_id = fields.Many2one('pos.config', 'POS Config', readonly=1)
    session_id = fields.Many2one('pos.session', 'POS Session', readonly=1)

    def saveLogActionOfOrder(self, vals):
        return self.create({
            'session_id': vals.get('session_id'),
            'config_id': vals.get('config_id'),
            'name': vals.get('uid'),
            'action': vals.get('action'),
            'order_json': json.dumps(vals.get('order_json'))
        }).id


class PosBackUpOrders(models.Model):
    _name = "pos.backup.orders"
    _description = "This is table save all orders on POS Session, if POS Session Crash. POS Users can restore back all Orders"

    config_id = fields.Many2one('pos.config', required=1, readonly=1)
    unpaid_orders = fields.Text('UnPaid Orders', readonly=1)
    total_orders = fields.Integer('Total Order Unpaid', readonly=1)

    def automaticBackupUnpaidOrders(self, vals):
        old_backups = self.search([
            ('config_id', '=', vals.get('config_id'))
        ])
        if old_backups:
            old_backups.write({
                'unpaid_orders': json.dumps(vals.get('unpaid_orders')),
                'total_orders': vals.get('total_orders')
            })
            return old_backups[0].id
        else:
            return self.create({
                'config_id': vals.get('config_id'),
                'unpaid_orders': json.dumps(vals.get('unpaid_orders')),
                'total_orders': vals.get('total_orders')
            }).id

    def getUnpaidOrders(self, vals):
        old_backups = self.search([
            ('config_id', '=', vals.get('config_id'))
        ])
        if old_backups:
            return old_backups[0].unpaid_orders
        else:
            return []
