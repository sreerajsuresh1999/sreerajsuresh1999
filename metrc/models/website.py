from odoo import models, fields


class Website(models.Model):
    _inherit = 'website'

    facility_id = fields.Many2one('metrc.facility', string='Facility')
