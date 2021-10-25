# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from itertools import groupby

from odoo.http import request
from reportlab.graphics.barcode import createBarcodeDrawing
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import werkzeug
import base64

import logging

_logger = logging.getLogger(__name__)


class RestaurantTable(models.Model):
    _inherit = "restaurant.table"

    locked = fields.Boolean('Locked (Reservation)')
    user_ids = fields.Many2many(
        'res.users',
        'restaurant_table_res_users_rel',
        'table_id',
        'user_id',
        string='Assign Users',
        help='Only Users assigned here only see tables assigned on POS Tables Screen'
    )
    barcode_url = fields.Char(
        string='QR Barcode URL',
        help='You can print this Barcode on header Print Button \n'
             'Customer come your restaurant and use them self Mobile scan this code \n'
             'Scan succeed, on mobile of Customer auot open new link for order product'
    )
    qr_image = fields.Binary('Barcode of Table')
    pricelist_id = fields.Many2one('product.pricelist', 'Special Pricelist')

    def render_image_base64(self, value, width, hight, hr, code='QR'):
        options = {}
        if hr: options['humanReadable'] = True
        try:
            res = createBarcodeDrawing(code, value=str(value), **options)
        except ValidationError as e:
            raise ValueError(e)
        return base64.encodestring(res.asString('jpg'))

    def initialization_qrcode(self):
        base_domain_system = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
        if not base_domain_system or base_domain_system == 'http://localhost:8069':
            raise UserError(_(
                'Error !!! Your Odoo required hosting Online because customer scan QrCode, \n'
                'and go to your Odoo address online. \n'
                'If setup localhost or local your network, feature can not work'))
        config = self.env['pos.config'].sudo().search(
            [('restaurant_order', '=', True), ('restaurant_order_login', '!=', None),
             ('restaurant_order_password', '!=', None)], limit=1)
        if not config:
            raise UserError(_(
                'Error !!! Please set 1 POS Config is Restaurant Order. Please go to create new POS Config, go to tab Sync Between Session and active feature Restaurant Order'))
        try:
            uid = request.session.authenticate(request.session.db, config.restaurant_order_login,
                                               config.restaurant_order_password)
        except:
            raise UserError(_(
                'Error !!! Please checking:  \n'
                'Restaurant Order Login and Password of POS Config %s \n'
                'It is wrong login or password.', config.name))
        tables = self.sudo().search([])
        for table in tables:
            barcode_url = "%s/public/posodoo?table_id=%s&config_id=%s" % (
                base_domain_system, table.id, config.id)
            image = self.render_image_base64(barcode_url, code='QR', width=150, hight=150, hr=True)
            table.sudo().write({
                'qr_image': image,
                'barcode_url': barcode_url
            })
        return {
            'name': 'Successfully Setup',
            'res_model': 'ir.actions.act_url',
            'type': 'ir.actions.act_url',
            'target': 'self',
            'url': base_domain_system + '/web/login'
        }

    def lock_table(self, vals):
        return self.write(vals)


class RestaurantTable(models.Model):
    _inherit = "restaurant.floor"

    pricelist_id = fields.Many2one(
        'product.pricelist', string='Pricelist',
        help='Pricelist of Floor will apply to new Order of this Floor')

    def write(self, vals):
        res = super(RestaurantTable, self).write(vals)
        if vals.get('pricelist_id', None):
            for floor in self:
                floor.table_ids.write({'pricelist_id': floor.pricelist_id})
        return res
