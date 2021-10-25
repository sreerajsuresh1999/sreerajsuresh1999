# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _
from odoo.exceptions import UserError

class res_currency_rate(models.Model):

    _inherit = "res.currency.rate"

    @api.model
    def create(self, vals):
        if vals.get('rate', False) and vals.get('rate') == 0:
            raise UserError('Rate can not is 0')
        return super(res_currency_rate, self).create(vals)

    def write(self, vals):
        if vals.get('rate', False) and vals.get('rate') == 0:
            raise UserError('Rate can not is 0')
        return super(res_currency_rate, self).write(vals)
