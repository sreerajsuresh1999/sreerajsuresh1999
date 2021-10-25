# -*- coding: utf-8 -*-
from odoo import models, fields, api, _


class PosQrCode(models.Model):
    _name = "pos.qrcode"
    _description = "QrCode fields display for scan qrcode of Receipt"

    name = fields.Char('QrCode Label', required=1)
    field_id = fields.Many2one(
        'ir.model.fields',
        domain=[
            ('model', '=', 'pos.order'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Field Display',
        required=1,
        ondelete='cascade'
    )
    config_id = fields.Many2one('pos.config', 'POS Register', required=1)

    @api.onchange('field_id')
    def onchange_field_id(self):
        if self.field_id:
            self.name = self.field_id.field_description
