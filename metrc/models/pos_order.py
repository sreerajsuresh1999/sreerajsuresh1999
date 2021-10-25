from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    metrc_synced = fields.Boolean('METRC Synced', default=False)

