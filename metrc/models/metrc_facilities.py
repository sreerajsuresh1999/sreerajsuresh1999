from odoo import models, fields


class MetrcFacilities(models.Model):
    _name = 'metrc.facility'

    name = fields.Char('Name')
    alias = fields.Char('Alias')
    display_name = fields.Char('Display Name')
    license_number = fields.Char('License Number')
    license_type = fields.Char('License Type')

    hire_date = fields.Date('Hire Date')
    cred_date = fields.Date('Credentialed Date')
    lic_start_date = fields.Date('License Start Date')
    lic_end_date = fields.Date('License End Date')

    is_owner = fields.Boolean('Is Owner')
    is_manager = fields.Boolean('Is Manager')

    product_ids = fields.Many2many('product.template', string='Products')
    patient_ids = fields.Many2many('metrc.patient', string='Patients')
    package_ids = fields.Many2many('stock.production.lot', string='Packages')
    strain_ids = fields.Many2many('metrc.strain', string='Strains')
    transfer_type_ids = fields.Many2many('metrc.transfer.type', string='Transfer Types')
    location_type_ids = fields.Many2many('metrc.location.type', string='Location Types')
    location_ids = fields.Many2many('stock.location', string='Locations')

    address = fields.Text('Address')
    city = fields.Text('City, State, ZIP Code')
    phone = fields.Char('Phone Number')
    contact_name = fields.Char('Contact Name')

    def sync_employees(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_employee(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Employees.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_patients(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_patient(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Patients.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_packages(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_package(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Packages.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_products(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_products(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Products.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_strains(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_strains(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Strains.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_transfer_types(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_transfer_types(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Transfer Types.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_pos_orders(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_pos_orders(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced PoS Orders.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_location_types(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_location_types(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Location Types.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_locations(self):
        res = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1).sync_metrc_locations(self)
        if res:
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Locations.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')
