# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class ProductPackaging(models.Model):
    _inherit = "product.packaging"

    list_price = fields.Float('Sale price')
    active = fields.Boolean('Active', default=1)