# -*- coding: utf-8 -*-

from odoo import models, fields, api
from odoo.http import request
from odoo.addons.ehcs_qr_code_base.models.qr_code_base import generate_qr_code


class QRCodeSale(models.Model):
    _inherit = 'sale.order'

    qr_image = fields.Binary("QR Code", compute='_generate_qr_code')
    qr_in_report = fields.Boolean('Show QR in Report')

    @api.model
    def _generate_qr_code(self):
        base_url = self.name
        self.qr_image = generate_qr_code(base_url)
