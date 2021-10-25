# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductModel(models.Model):
    _name = "product.model"
    _description = "Product Model"

    name = fields.Char('Model Name', required=1)
    code = fields.Char('Code')
