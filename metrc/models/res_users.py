from odoo import models, fields, api


class ResUsers(models.Model):
    _inherit = 'res.users'

    metrc_access = fields.Boolean('METRC Access', store=True, default=False)

    def get_record_id(self):
        return self.search([('login', '=', self.login)], limit=1).id

    @api.onchange('metrc_access')
    def _onchange_metrc_access(self):
        mu_group = self.env.ref('metrc.metrc_user_group')
        rec_id = self.get_record_id()
        if self.metrc_access:
            mu_group.write({'users': [(4, rec_id)]})
            self.metrc_access = True
        else:
            mu_group.write({'users': [(3, rec_id)]})
            self.metrc_access = False
