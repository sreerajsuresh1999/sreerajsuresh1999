from odoo import models, fields


class PackageSplit(models.TransientModel):
    _name = 'metrc.package.split'

    package_id = fields.Many2one('stock.production.lot', string='Package')
    warehouse_id = fields.Many2one('stock.warehouse', string='Warehouse')
    facility_id = fields.Many2one('metrc.facility', string='Facility')
    qty = fields.Float(string='Quantity')
    uom = fields.Char(string='Unit Of Measure')
    starting_tag = fields.Char(string='Starting Tag')
    patient_license = fields.Char(string='Patient License Number')
    note = fields.Char(string='Note')
    splits = fields.Integer(string='Number of Splits')

    def split_popup(self, values):
        warehouse_id = self.env['stock.warehouse'].sudo().search([('facility_id.id', '=', values['facility_id'])])
        if warehouse_id:
            split_id = self.env['metrc.package.split'].sudo().create({
                'package_id': values['package_id'],
                'warehouse_id': warehouse_id.id,
                'facility_id': values['facility_id'],
                'uom': values['uom'],
            })
            return {
                'name': 'METRC Package Split',
                'type': 'ir.actions.act_window',
                'view_mode': 'form',
                'res_model': 'metrc.package.split',
                'res_id': split_id.id,
                'target': 'new'
            }
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'No warehouse for the facility related to the package.')

    def submit_split(self):
        start_tag = self.starting_tag
        tag_list = []
        for split in range(0, self.splits):
            tag_list.append(start_tag)
            number_part_string = ""
            string_part = ""
            for i in start_tag:
                if i.isdigit():
                    number_part_string += i
                else:
                    string_part += number_part_string
                    string_part += i
                    number_part_string = ""
            number_part = int(number_part_string)
            next_number = number_part + 1
            if len(str(next_number)) < len(number_part_string):
                start_tag = string_part + ("0" * (len(number_part_string)-len(str(next_number)))) + str(next_number)
        warehouse = self.env['stock.warehouse'].sudo().search([('facility_id.id', '=', self.facility_id.id)], limit=1)
        picking_type = self.env['stock.picking.type'].sudo().search([('code', '=', 'mrp_operation'),
                                                                     ('warehouse_id.id', '=', warehouse.id)], limit=1)
        account = self.env['metrc.account'].sudo().search([('active_', '=', True)], limit=1)
        virtual_prod = self.env['stock.location'].sudo().search([('complete_name', '=', 'Virtual Locations/Production')], limit=1)
        available_tags = []
        unavailable_tags = []
        for tag in tag_list:
            tag_check = account.check_tag_availability(tag, self)
            if tag_check:
                unavailable_tags.append(tag)
            else:
                available_tags.append(tag)
        if unavailable_tags:
            msg = "The following tags are already taken"
            for tag in unavailable_tags:
                msg += ("\n>> " + str(tag))
            if available_tags:
                msg += "\nThe following tags are available"
                for tag in available_tags:
                    msg += ("\n>> " + str(tag))
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed',
                                                                         "%s"%msg)
        else:
            response = account.create_package(tag_list, self)
            if response:
                return self.env['metrc.message.wizard'].sudo().popup_message('Failed',
                                                                             "%s" % response)
            msg = "Packages are created with the following tags"
            up_qty = account.get_package_qty(self.package_id.name, self.facility_id.license_number)
            if up_qty:
                self.package_id.metrc_qty = up_qty
            for tag in tag_list:
                msg += ("\n>> " + str(tag))
                up_id = account.get_package_id(tag, self.facility_id.license_number)
                package_id = self.env['stock.production.lot'].sudo().create({
                        'name': tag,
                        'product_id': self.package_id.product_id.id,
                        'facility_id': self.facility_id.id,
                        'metrc_id': up_id,
                        'metrc_qty': self.qty,
                        'company_id': self.env.company.id,
                    })
                self.facility_id.sudo().write({'package_ids': [(4, package_id.id)]})
                manufacturing_order = self.env['mrp.production'].sudo().create({
                    'product_id': self.package_id.product_id.id,
                    'product_uom_id': self.package_id.product_id.uom_id.id,
                    'product_qty': self.qty,
                    'product_uom_qty': self.qty,
                    'qty_produced': self.qty,
                    'company_id': self.env.company.id,
                    'picking_type_id': picking_type.id,
                    'location_src_id': warehouse.lot_stock_id.id,
                    'location_dest_id': warehouse.lot_stock_id.id,
                    'move_raw_ids': [
                        (0, '', {
                            'name': self.package_id.product_id.name,
                            'product_id': self.package_id.product_id.id,
                            'product_uom': self.package_id.product_id.uom_id.id,
                            'product_uom_qty': self.qty,
                            'location_id': warehouse.lot_stock_id.id,
                            'location_dest_id': virtual_prod.id
                        })
                    ]
                })
                manufacturing_order.sudo().write({
                    'qty_producing': self.qty,
                    'lot_producing_id': package_id.id,
                    'move_finished_ids': [
                        (0, '', {
                            'name': self.package_id.product_id.name,
                            'product_id': self.package_id.product_id.id,
                            'product_uom': self.package_id.product_id.uom_id.id,
                            'product_uom_qty': self.qty,
                            'location_id': virtual_prod.id,
                            'location_dest_id': warehouse.lot_stock_id.id
                        })
                    ]
                })
                manufacturing_order.action_confirm()
                stock_move_line = self.env['stock.move.line'].sudo().create({
                    'move_id': manufacturing_order.move_raw_ids[0].id,
                    'product_id': self.package_id.product_id.id,
                    'location_id': warehouse.lot_stock_id.id,
                    'lot_id': self.package_id.id,
                    'product_uom_qty': self.qty,
                    'qty_done': self.qty,
                    'product_uom_id': self.package_id.product_id.uom_id.id,
                    'company_id': self.env.company.id,
                    'location_dest_id': virtual_prod.id,
                })
                stock_move_line2 = self.env['stock.move.line'].sudo().create({
                    'move_id': manufacturing_order.move_finished_ids[0].id,
                    'product_id': self.package_id.product_id.id,
                    'location_id': virtual_prod.id,
                    'lot_id': package_id.id,
                    'product_uom_qty': self.qty,
                    'qty_done': self.qty,
                    'product_uom_id': self.package_id.product_id.uom_id.id,
                    'company_id': self.env.company.id,
                    'location_dest_id': warehouse.lot_stock_id.id,
                })
                manufacturing_order.qty_produced = self.qty
                manufacturing_order.move_raw_ids[0].quantity_done = self.qty
                manufacturing_order.move_raw_ids[0].state = 'done'
                manufacturing_order.move_finished_ids[0].state = 'done'
                manufacturing_order.action_assign()
                manufacturing_order.button_mark_done()
                child_quant = self.env['stock.quant'].sudo().create({
                    'lot_id': package_id.id,
                    'product_id': package_id.product_id.id,
                    'location_id': warehouse.lot_stock_id.id,
                    'quantity': self.qty})
                parent_loc = self.package_id.quant_ids.filtered(lambda q: q.location_id.id == warehouse.lot_stock_id.id)
                if parent_loc:
                    parent_loc[0].sudo().quantity = parent_loc[0].quantity - self.qty
                manufacturing_order.lot_producing_id._product_qty()
                self.package_id._product_qty()
            return self.env['metrc.message.wizard'].sudo().popup_message('Success',
                                                                         "%s" % msg)
