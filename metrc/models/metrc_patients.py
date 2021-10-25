from odoo import models, fields


class MetrcPatients(models.Model):
    _name = 'metrc.patient'

    patient_id = fields.Char('Patient ID')
    license_number = fields.Char('License Number')
    registration_date = fields.Date('Registration Date')
    license_start_date = fields.Date('License Effective Start Date')
    license_end_date = fields.Date('License Effective End Date')
    recommended_plants = fields.Integer('Recommended Plants')
    recommended_smokable_qty = fields.Float('Recommended Smokable Quantity')
    sales_limit_exemption = fields.Boolean('Has Sales Limit Exemption')
    other_facilities_count = fields.Integer('Other Facilities Count')
