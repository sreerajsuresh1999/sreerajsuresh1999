# -*- coding: utf-8 -*
from odoo import http, _
from odoo.addons.web.controllers import main as web
import odoo
from odoo import api, fields, models, SUPERUSER_ID

import json
import logging
from odoo.http import request

_logger = logging.getLogger(__name__)


class SyncController(web.Home):

    def __init__(self):
        super(SyncController, self).__init__()
        _logger.info('[__init__] SyncController')
        self.auto_push_orders = False

    @http.route('/pos/create_from_ui', type="json", auth='none', csrf=False, cors='*', methods=['POST'])
    def endpoint_save_orders(self):
        datas = json.loads(request.httprequest.data)
        database = datas.get('database')
        username = datas.get('username')
        server_version = datas.get('server_version')
        orders = datas.get('orders')
        order_ids = []
        if len(orders) > 0:
            registry = odoo.registry(database)
            orders = [order[2] for order in orders]
            with registry.cursor() as cr:
                env = api.Environment(cr, SUPERUSER_ID, {})
                order_ids = env['pos.order'].sudo().create_from_ui(orders)
                _logger.info('User %s created order ids: %s - odoo version %s' % (username, order_ids, server_version))
        return order_ids

    @http.route('/pos/automation/paid_orders', type="json", auth='user', cors='*')
    def push_orders(self, message, config_id):
        values = []
        if self.auto_push_orders:
            return json.dumps({'status': 'waiting', 'values': []})
        else:
            self.auto_push_orders = True
            orders = request.env['pos.order'].search([
                ('state', '=', 'draft'),
                ('config_id', '=', config_id)
            ])
            for order in orders:
                is_paid = order._is_pos_order_paid()
                if (order.amount_paid > 0 and order.amount_total > 0 and order.amount_paid >= order.amount_total) or (is_paid):
                    request.env['pos.make.payment'].with_context({'active_id': order.id}).create({
                        'config_id': order.config_id.id,
                        'amount': order.amount_total - order.amount_paid,
                        'payment_name': 'Auto Register Payment: %s' % order.name,
                        'payment_date': fields.Datetime.today()
                    }).check()
                    _logger.info('{POS} order %s automatic paid' % order.name)
                    request.env.cr.commit()
            self.auto_push_orders = False
        return json.dumps({'status': 'succeed', 'values': values})

