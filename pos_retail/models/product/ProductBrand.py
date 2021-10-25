# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductBrand(models.Model):
    _name = "pos.product.brand"
    _description = "Product Brand"

    name = fields.Char('Brand Name', required=1)
    logo = fields.Binary('Brand Logo')
    code = fields.Char('Code')