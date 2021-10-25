# -*- coding: utf-8 -*
from odoo.http import request
from odoo.addons.bus.controllers.main import BusController
from odoo import http, _
from datetime import datetime
import odoo

version_info = odoo.release.version_info[0]

datetime.strptime('2012-01-01', '%Y-%m-%d')

import logging

_logger = logging.getLogger(__name__)


class pos_bus(BusController):

    def _poll(self, dbname, channels, last, options):
        channels = list(channels)
        if request.env.user:
            channels.append((request.db, 'pos.test.polling', request.env.user.id))
            channels.append((request.db, 'pos.sync.pricelists', request.env.user.id))
            channels.append((request.db, 'pos.sync.promotions', request.env.user.id))
            channels.append((request.db, 'pos.remote_sessions', request.env.user.id))
            channels.append((request.db, 'pos.sync.sessions', request.env.user.id))
            channels.append((request.db, 'pos.confirm.place.order', request.env.user.id))
            channels.append((request.db, 'pos.modifiers.background', request.env.user.id))
            channels.append((request.db, 'sync.backend', request.env.user.id))
            channels.append((request.db, 'pos.session.login', request.env.user.id))
        return super(pos_bus, self)._poll(dbname, channels, last, options)

    @http.route('/pos/update_order/status', type="json", auth="public")
    def bus_update_sale_order(self, status, order_name):
        sales = request.env["sale.order"].sudo().search([('name', '=', order_name)])
        sales.write({'sync_status': status})
        return 1

    @http.route('/pos/test/polling', type="json", auth="public")
    def test_polling(self, pos_id, messages):
        request.env['bus.bus'].sendmany(
            [[(request.env.cr.dbname, 'pos.test.polling', 1), messages]])
        return 1

