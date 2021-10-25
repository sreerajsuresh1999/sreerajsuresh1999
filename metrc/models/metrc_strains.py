from odoo import models, fields


class MetrcStrain(models.Model):
    _name = 'metrc.strain'

    metrc_id = fields.Char('METRC ID')
    name = fields.Char('Name')
    testing_status = fields.Char('Testing Status')
    thc_level = fields.Float('THC Level')
    cbd_level = fields.Float('CBD Level')
    ind_percentage = fields.Float('Indica Percentage')
    sat_percentage = fields.Float('Sativa Percentage')
    is_used = fields.Boolean('Is Used')
    genetics = fields.Char('Genetics')
