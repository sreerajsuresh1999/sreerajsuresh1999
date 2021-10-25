from odoo import models, fields


class CustomerTypes(models.Model):
    _name = 'metrc.customer.type'

    name = fields.Char('Name')
