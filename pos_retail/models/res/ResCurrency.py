# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class ResCurrency(models.Model):
    _inherit = 'res.currency'

    company_id = fields.Many2one(
        'res.company',
        string='Company', required=True,
        default=lambda self: self.env.user.company_id)
    converted_currency = fields.Float('Converted Currency', compute="_onchange_currency")

    @api.depends('company_id')
    def _onchange_currency(self):
        company_currency = self.env.user.company_id.currency_id
        for i in self:
            if i.id == company_currency.id:
                i.converted_currency = 1
            else:
                rate = (i.rate / company_currency.rate)
                i.converted_currency = rate