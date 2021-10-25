# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductCollege(models.Model):
    _name = "product.college"
    _description = "Product College"

    name = fields.Char('College Name', required=1)
    code = fields.Char('Code')
