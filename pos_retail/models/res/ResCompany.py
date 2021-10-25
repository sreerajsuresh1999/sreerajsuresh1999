# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class ResCompany(models.Model):
    _inherit = 'res.company'

    contact_address = fields.Char(compute='_compute_contact_address')

    def _compute_contact_address(self):
        for company in self.filtered(lambda company: company.partner_id):
            company.contact_address = company.partner_id.contact_address