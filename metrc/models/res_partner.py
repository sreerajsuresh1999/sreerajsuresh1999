from odoo import models, fields


class ResPartner(models.Model):
    _inherit = 'res.partner'

    metrc_type = fields.Selection([('Driver', 'Driver'), ('Facility', 'Facility'), ('Customer', 'Customer')], default='Customer')
    facility_id = fields.Many2one('metrc.facility', string='Facility ID')
    customer_type = fields.Many2one('metrc.customer.type', string='Customer Type')
    driver_lic_num = fields.Char("Driver's License Number")
    patient_lic_num = fields.Char('Patient License Number')
    caregiver_lic_num = fields.Char('Caregiver License Number')
    identification_method = fields.Char('Identification Method')
