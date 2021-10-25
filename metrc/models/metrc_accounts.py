import base64
import json
import requests
from datetime import datetime
from python_metrc import METRC

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class MetrcAccounts(models.Model):
    _name = 'metrc.account'

    name = fields.Char()
    actives = fields.Selection([('active', 'Deactivate'), ('deactive', 'Activate')], default='deactive')
    api_version = fields.Char('API Version')
    url = fields.Char()
    password1 = fields.Char()
    password2 = fields.Char()
    active_ = fields.Boolean(string='Active', default=False)
    logs = fields.One2many('metrc.log', 'account_id', string='Logs')

    def toggle_active(self):
        res = self.sudo().search([('active_', '=', True)])
        if self.active_:
            self.actives = 'deactive'
            self.active_ = False
        else:
            if res:
                raise ValidationError(_("Active account already exists."))
            else:
                self.actives = 'active'
                self.active_ = True

    def test_metrc_connection(self):
        """metrc = METRC('https://sandbox-api-ca.metrc.com',
        vendor_key='Kvv3lbhPMksU76J6l3IB6PRxtOG2JW0fIT93QjP5Ww4-nwI9',
                      user_key='FusVbe4Yv6W1DGNuxKNhByXU6RO6jSUPcbRCoRDD98VNXc4D',
                      license_number='')"""
        if self.active_:
            metrc = METRC(self.url,
                          vendor_key=self.password1,
                          user_key=self.password2,
                          license_number='')
            data = metrc.facilities.get()
            if data.status_code == 200:
                return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Test Connection Successful.')
            else:
                return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Test Connection Failed.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def get_header(self):
        api_comb = self.password1 + ':' + self.password2
        b = bytes(api_comb, 'utf-8')
        encoded = base64.b64encode(b)
        string_value = encoded.decode("utf-8")
        headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Basic %s' % string_value,
            'Accept': 'application/json',
        }
        return headers

    def get_package_id(self, tag, license_number):
        headers = self.get_header()
        url = self.url + "/packages/" + self.api_version + "/" + tag + "?licenseNumber=" + license_number
        response = requests.get(url=url, headers=headers)
        if response.status_code == 200 and response.json():
            return response.json()['Id']
        else:
            return ''

    def get_package_qty(self, tag, license_number):
        headers = self.get_header()
        url = self.url + "/packages/" + self.api_version + "/" + tag + "?licenseNumber=" + license_number
        response = requests.get(url=url, headers=headers)
        if response.status_code == 200 and response.json():
            return response.json()['Quantity']
        else:
            return False

    def check_tag_availability(self, tag, wizard):
        headers = self.get_header()
        parent = wizard.package_id
        url = self.url + "/packages/" + self.api_version + "/" + tag + "?licenseNumber=" + parent.facility_id.license_number
        response = requests.get(url=url, headers=headers)
        if response.status_code == 200:
            return True
        else:
            return False

    def create_item(self, wizard):
        headers = self.get_header()
        facilities = wizard.facility_ids
        product = wizard.product_id
        item = [{
                "ItemCategory": product.categ_id.name if product.categ_id.name else 'Buds',
                "Name": product.name,
                "UnitOfMeasure": product.uom_id.metrc_name if product.uom_id else 'Ounces',
                "Strain": product.strain_name if product.strain_name else 'Spring Hill Kush',
                "ItemBrand": None,
                "AdministrationMethod": None,
                "UnitCbdPercent": None,
                "UnitCbdContent": None,
                "UnitCbdContentUnitOfMeasure": None,
                "UnitCbdContentDose": None,
                "UnitCbdContentDoseUnitOfMeasure": None,
                "UnitThcPercent": None,
                "UnitThcContent": product.unit_thc_content if product.unit_thc_content else None,
                "UnitThcContentUnitOfMeasure": product.unit_thc_content_uom if product.unit_thc_content_uom else None,
                "UnitThcContentDose": None,
                "UnitThcContentDoseUnitOfMeasure": None,
                "UnitVolume": product.unit_volume if product.unit_volume else None,
                "UnitVolumeUnitOfMeasure": product.unit_volume_uom if product.unit_volume_uom else None,
                "UnitWeight": product.unit_weight if product.unit_weight else None,
                "UnitWeightUnitOfMeasure": product.unit_weight_uom if product.unit_weight_uom else None,
                "ServingSize": None,
                "SupplyDurationDays": None,
                "NumberOfDoses": None,
                "PublicIngredients": None,
                "ItemIngredients": None,
                "Description": None
                }]
        data = json.dumps(item)
        flag = True
        for facility in facilities:
            url = self.url + "/items/" + self.api_version + "/create?licenseNumber=" + facility.license_number
            response = requests.post(url=url, headers=headers, data=data)
            response_string = ""
            for line in response:
                response_string += line.decode("UTF-8")
            if response.status_code == 200:
                flag = False
            else:
                flag = response_string
        return flag

    def create_package(self, tags, wizard):
        headers = self.get_header()
        parent = wizard.package_id
        url = self.url + "/packages/" + self.api_version + "/create?licenseNumber=" + parent.facility_id.license_number
        text = []
        for tag in tags:
            text.append({
                'Tag': tag,
                'Location': None,
                'Item': parent.product_id.name,
                'Quantity': wizard.qty,
                'UnitOfMeasure': parent.product_uom_id.metrc_name,
                'PatientLicenseNumber': wizard.patient_license if wizard.patient_license else None,
                'Note': wizard.note if wizard.note else None,
                'IsProductionBatch': None,
                'ProductionBatchNumber': None,
                'IsDonation': None,
                'ProductRequiresRemediation': False,
                'UseSameItem': False,
                'ActualDate': datetime.now().strftime('%Y-%m-%d'),
                'Ingredients': [
                    {
                        'Package': parent.name,
                        'Quantity': wizard.qty,
                        'UnitOfMeasure': parent.uom_id.metrc_name,
                    }
                ]
            })
        data = json.dumps(text)
        response = requests.post(url=url, headers=headers, data=data)
        response_string = ""
        for line in response:
            response_string += line.decode("UTF-8")
        if response.status_code == 200:
            return False
        else:
            return response_string

    def sync_metrc_product(self, pid):
        headers = self.get_header()
        url = self.url + "/items/" + self.api_version + "/" + pid
        response = requests.get(url=url, headers=headers)
        if response.status_code == 200:
            product = response.json()
            uom_id = self.env['uom.uom'].sudo().search([('metrc_name', '=', product['UnitOfMeasureName'])])

            categ_id = self.env['product.category'].sudo().search([('name', '=', product['ProductCategoryName'])],
                                                                  limit=1)
            if categ_id:
                pass
            else:
                categ_id = self.env['product.category'].sudo().create({
                    'name': product['ProductCategoryName'],
                    'property_valuation': 'manual_periodic',
                    'property_cost_method': 'standard',
                })
            product_obj = self.env['product.template'].sudo().create({
                "metrc_synced": True,
                "metrc_id": product['Id'],
                "name": product['Name'],
                "categ_id": categ_id.id,
                "type": 'product',
                "categ_type": product['ProductCategoryType'],
                "qty_type": product['QuantityType'],
                "def_lab_test_state": product['DefaultLabTestingState'],
                "uom_id": uom_id.id,
                "uom_po_id": uom_id.id,
                "tracking": 'lot',
                "approve_status": product['ApprovalStatus'],
                "approve_status_datetime": product['ApprovalStatusDateTime'],
                "strain_id": product['StrainId'],
                "strain_name": product['StrainName'],
                "unit_thc_content": product['UnitThcContent'],
                "unit_thc_content_uom": product['UnitThcContentUnitOfMeasureName'],
                "unit_volume": product['UnitVolume'],
                "unit_volume_uom": product['UnitVolumeUnitOfMeasureName'],
                "unit_weight": product['UnitWeight'],
                "unit_weight_uom": product['UnitWeightUnitOfMeasureName'],
            })
            return product_obj

    def sync_metrc_products(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/items/" + self.api_version + "/active?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                product_list = []
                for product in response_list:
                    uom_id = self.env['uom.uom'].sudo().search([('metrc_name', '=', product['UnitOfMeasureName'])])
                    categ_id = self.env['product.category'].sudo().search(
                        [('name', '=', product['ProductCategoryName'])], limit=1)
                    if categ_id:
                        pass
                    else:
                        categ_id = self.env['product.category'].sudo().create({
                            'name': product['ProductCategoryName'],
                            'property_valuation': 'manual_periodic',
                            'property_cost_method': 'standard',
                        })
                    product_obj = self.env['product.template'].sudo().search([('metrc_id', '=', product['Id'])],
                                                                             limit=1)
                    if product_obj:
                        product_obj.sudo().write({
                            "metrc_synced": True,
                            "name": product['Name'],
                            "categ_id": categ_id.id,
                            "categ_type": product['ProductCategoryType'],
                            "qty_type": product['QuantityType'],
                            "def_lab_test_state": product['DefaultLabTestingState'],
                            "uom_id": uom_id.id,
                            "uom_po_id": uom_id.id,
                            "tracking": 'lot',
                            "approve_status": product['ApprovalStatus'],
                            "approve_status_datetime": product['ApprovalStatusDateTime'],
                            "strain_id": product['StrainId'],
                            "strain_name": product['StrainName'],
                            "unit_thc_content": product['UnitThcContent'],
                            "unit_thc_content_uom": product['UnitThcContentUnitOfMeasureName'],
                            "unit_volume": product['UnitVolume'],
                            "unit_volume_uom": product['UnitVolumeUnitOfMeasureName'],
                            "unit_weight": product['UnitWeight'],
                            "unit_weight_uom": product['UnitWeightUnitOfMeasureName'],
                        })
                    else:
                        product_obj = self.env['product.template'].sudo().create({
                            "metrc_synced": True,
                            "metrc_id": product['Id'],
                            "name": product['Name'],
                            "categ_id": categ_id.id,
                            "type": 'product',
                            "categ_type": product['ProductCategoryType'],
                            "qty_type": product['QuantityType'],
                            "def_lab_test_state": product['DefaultLabTestingState'],
                            "uom_id": uom_id.id,
                            "uom_po_id": uom_id.id,
                            "tracking": 'lot',
                            "approve_status": product['ApprovalStatus'],
                            "approve_status_datetime": product['ApprovalStatusDateTime'],
                            "strain_id": product['StrainId'],
                            "strain_name": product['StrainName'],
                            "unit_thc_content": product['UnitThcContent'],
                            "unit_thc_content_uom": product['UnitThcContentUnitOfMeasureName'],
                            "unit_volume": product['UnitVolume'],
                            "unit_volume_uom": product['UnitVolumeUnitOfMeasureName'],
                            "unit_weight": product['UnitWeight'],
                            "unit_weight_uom": product['UnitWeightUnitOfMeasureName'],
                        })
                    product_list.append(product_obj.id)
                facility.sudo().write({'product_ids': product_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_strains(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/strains/" + self.api_version + "/active?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                facility.sudo().strain_ids.unlink()
                strain_list = []
                for strain in response_list:
                    strain_obj = self.env['metrc.strain'].sudo().create({
                        "metrc_id": strain['Id'],
                        "name": strain['Name'] if strain['Name'] else '',
                        "testing_status": strain['TestingStatus'] if strain['TestingStatus'] else '',
                        "thc_level": strain['ThcLevel'] if strain['ThcLevel'] else '',
                        "cbd_level": strain['CbdLevel'] if strain['CbdLevel'] else '',
                        "ind_percentage": strain['IndicaPercentage'] if strain['IndicaPercentage'] else '',
                        "sat_percentage": strain['SativaPercentage'] if strain['SativaPercentage'] else '',
                        "is_used": strain['IsUsed'] if strain['IsUsed'] else False,
                        "genetics": strain['Genetics'] if strain['Genetics'] else '',
                    })
                    strain_list.append(strain_obj.id)
                facility.sudo().write({'strain_ids': strain_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_transfer_types(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/transfers/" + self.api_version + "/types?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                type_list = []
                for transfer in response_list:
                    transfer_obj = self.env['metrc.transfer.type'].sudo().search([('name', '=', transfer['Name'])],
                                                                                 limit=1)
                    if transfer_obj:
                        transfer_obj.sudo().write({
                            "for_licensed_shipments": transfer['ForLicensedShipments'] if transfer[
                                'ForLicensedShipments'] else False,
                            "external_incoming": transfer['ForExternalIncomingShipments'] if transfer[
                                'ForExternalIncomingShipments'] else False,
                            "external_outgoing": transfer['ForExternalOutgoingShipments'] if transfer[
                                'ForExternalOutgoingShipments'] else False,
                            "destination_grs_wt": transfer['RequiresDestinationGrossWeight'] if transfer[
                                'RequiresDestinationGrossWeight'] else False,
                            "packages_grs_wt": transfer['RequiresPackagesGrossWeight'] if transfer[
                                'RequiresPackagesGrossWeight'] else False,
                        })
                    else:
                        transfer_obj = self.env['metrc.transfer.type'].sudo().create({
                            "name": transfer['Name'] if transfer['Name'] else '',
                            "for_licensed_shipments": transfer['ForLicensedShipments'] if transfer[
                                'ForLicensedShipments'] else False,
                            "external_incoming": transfer['ForExternalIncomingShipments'] if transfer[
                                'ForExternalIncomingShipments'] else False,
                            "external_outgoing": transfer['ForExternalOutgoingShipments'] if transfer[
                                'ForExternalOutgoingShipments'] else False,
                            "destination_grs_wt": transfer['RequiresDestinationGrossWeight'] if transfer[
                                'RequiresDestinationGrossWeight'] else False,
                            "packages_grs_wt": transfer['RequiresPackagesGrossWeight'] if transfer[
                                'RequiresPackagesGrossWeight'] else False,
                        })
                    type_list.append(transfer_obj.id)
                facility.sudo().write({'transfer_type_ids': type_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_location_types(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/locations/" + self.api_version + "/types?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                type_list = []
                for location in response_list:
                    location_obj = self.env['metrc.location.type'].sudo().search([('metrc_id', '=', location['Id'])],
                                                                                 limit=1)
                    if location_obj:
                        location_obj.sudo().write({
                            "metrc_id": location['Id'] if location['Id'] else '',
                            "name": location['Name'] if location['Name'] else '',
                            "for_plant_batches": location['ForPlantBatches'] if location['ForPlantBatches'] else False,
                            "for_plants": location['ForPlants'] if location['ForPlants'] else False,
                            "for_harvests": location['ForHarvests'] if location['ForHarvests'] else False,
                            "for_packages": location['ForPackages'] if location['ForPackages'] else False,
                        })
                    else:
                        location_obj = self.env['metrc.location.type'].sudo().create({
                            "metrc_id": location['Id'] if location['Id'] else '',
                            "name": location['Name'] if location['Name'] else '',
                            "for_plant_batches": location['ForPlantBatches'] if location['ForPlantBatches'] else False,
                            "for_plants": location['ForPlants'] if location['ForPlants'] else False,
                            "for_harvests": location['ForHarvests'] if location['ForHarvests'] else False,
                            "for_packages": location['ForPackages'] if location['ForPackages'] else False,
                        })
                    type_list.append(location_obj.id)
                facility.sudo().write({'location_type_ids': type_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_locations(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/locations/" + self.api_version + "/active?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                warehouse_obj = self.env['stock.warehouse'].sudo().search([('name', '=', facility.name)], limit=1)
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                location_list = []
                for location in response_list:
                    loc_id = self.env['metrc.location.type'].sudo().search(
                        [('metrc_id', '=', location['LocationTypeId'])], limit=1)
                    if loc_id:
                        pass
                    else:
                        loc_id = self.env['metrc.location.type'].sudo().create({
                            "metrc_id": location['LocationTypeId'],
                            "name": location['LocationTypeName'],
                            "for_plant_batches": location['ForPlantBatches'] if location[
                                'ForPlantBatches'] else False,
                            "for_plants": location['ForPlants'] if location['ForPlants'] else False,
                            "for_harvests": location['ForHarvests'] if location['ForHarvests'] else False,
                            "for_packages": location['ForPackages'] if location['ForPackages'] else False,
                        })
                    location_obj = self.env['stock.location'].sudo().search([('metrc_id', '=', location['Id'])],
                                                                            limit=1)
                    if location_obj:
                        location_obj.sudo().write({
                            "name": location['Name'] if location['Name'] else '',
                            "location_type_id": loc_id.id,
                            "metrc_name": location['Name'] if location['Name'] else '',
                            "location_type_metrc_id": location['LocationTypeId'] if location[
                                'LocationTypeId'] else False,
                            "location_type_name": location['LocationTypeName'] if location['LocationTypeName'] else '',
                            "for_plant_batches": location['ForPlantBatches'],
                            "for_plants": location['ForPlants'],
                            "for_harvests": location['ForHarvests'],
                            "for_packages": location['ForPackages'],
                        })
                    else:
                        location_obj = self.env['stock.location'].sudo().create({
                            'location_id': warehouse_obj.lot_stock_id.id,
                            "name": location['Name'] if location['Name'] else '',
                            "metrc_id": location['Id'] if location['Id'] else '',
                            "location_type_id": loc_id.id,
                            "metrc_name": location['Name'] if location['Name'] else '',
                            "location_type_metrc_id": location['LocationTypeId'] if location[
                                'LocationTypeId'] else False,
                            "location_type_name": location['LocationTypeName'] if location['LocationTypeName'] else '',
                            "for_plant_batches": location['ForPlantBatches'],
                            "for_plants": location['ForPlants'],
                            "for_harvests": location['ForHarvests'],
                            "for_packages": location['ForPackages'],
                        })
                    location_list.append(location_obj.id)
                facility.sudo().write({'location_ids': location_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_employee(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/employees/" + self.api_version + "/?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
            else:
                pass
        return True

    def sync_metrc_patient(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/patients/" + self.api_version + "/active?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                patient_list = []
                for patient in response_list:
                    patient_obj = self.env['metrc.patient'].sudo().search([('patient_id', '=', patient['PatientId'])],
                                                                          limit=1)
                    if patient_obj:
                        patient_obj.sudo().write({
                            'license_number': patient['LicenseNumber'] if patient['LicenseNumber'] else '',
                            'registration_date': patient['RegistrationDate'] if patient['RegistrationDate'] else '',
                            'license_start_date': patient['LicenseEffectiveStartDate'] if patient[
                                'LicenseEffectiveStartDate'] else '',
                            'license_end_date': patient['LicenseEffectiveEndDate'] if patient[
                                'LicenseEffectiveEndDate'] else '',
                            'recommended_plants': patient['RecommendedPlants'] if patient['RecommendedPlants'] else 0,
                            'recommended_smokable_qty': patient['RecommendedSmokableQuantity'] if patient[
                                'RecommendedSmokableQuantity'] else 0,
                            'sales_limit_exemption': True if patient['HasSalesLimitExemption'] else False,
                            'other_facilities_count': patient['OtherFacilitiesCount'] if patient[
                                'OtherFacilitiesCount'] else 0,
                        })
                    else:
                        patient_obj = self.env['metrc.patient'].sudo().create({
                            'patient_id': patient['PatientId'] if patient['PatientId'] else '',
                            'license_number': patient['LicenseNumber'] if patient['LicenseNumber'] else '',
                            'registration_date': patient['RegistrationDate'] if patient['RegistrationDate'] else '',
                            'license_start_date': patient['LicenseEffectiveStartDate'] if patient[
                                'LicenseEffectiveStartDate'] else '',
                            'license_end_date': patient['LicenseEffectiveEndDate'] if patient[
                                'LicenseEffectiveEndDate'] else '',
                            'recommended_plants': patient['RecommendedPlants'] if patient['RecommendedPlants'] else 0,
                            'recommended_smokable_qty': patient['RecommendedSmokableQuantity'] if patient[
                                'RecommendedSmokableQuantity'] else 0,
                            'sales_limit_exemption': True if patient['HasSalesLimitExemption'] else False,
                            'other_facilities_count': patient['OtherFacilitiesCount'] if patient[
                                'OtherFacilitiesCount'] else 0,
                        })
                    patient_list.append(patient_obj.id)
                facility.sudo().write({'patient_ids': patient_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_package(self, facility):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/packages/" + self.api_version + "/active?licenseNumber=" + facility.license_number
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                package_list = []
                for package in response_list:
                    uom_id = self.env['uom.uom'].sudo().search([('metrc_name', '=', package['UnitOfMeasureName'])])
                    package_id = self.env['stock.production.lot'].sudo().search([('name', '=', package['Label'])],
                                                                                limit=1)
                    if package_id:
                        package_id.sudo().write({
                            'facility_id': facility.id,
                            'uom_id': uom_id.id,
                            'metrc_id': package['Id'],
                            'metrc_qty': package['Quantity']
                        })
                    else:
                        product = self.env['product.template'].sudo().search([('name', '=', package['Item']['Name'])],
                                                                             limit=1)
                        if product:
                            pass
                        else:
                            product = self.sync_metrc_product(str(package['Item']['Id']))
                        package_id = self.env['stock.production.lot'].sudo().create({
                            'name': package['Label'],
                            'product_id': product.id,
                            'facility_id': facility.id,
                            'uom_id': uom_id.id,
                            'metrc_id': package['Id'],
                            'metrc_qty': package['Quantity'],
                            'company_id': self.env.company.id,
                        })
                    package_list.append(package_id.id)
                facility.sudo().write({'package_ids': package_list})
                self.env.cr.commit()
            return True
        else:
            return False

    def sync_metrc_facility_strains(self):
        account = self.sudo().search([('active_', '=', True)], limit=1)
        if account:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                account.sync_metrc_strains(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Strains.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_transfer_types(self):
        account = self.sudo().search([('active_', '=', True)], limit=1)
        if account:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                account.sync_metrc_transfer_types(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success',
                                                                         'Successfully Synced Transfer Types.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_products(self):
        if self.active_:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                self.sync_metrc_products(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Products.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_patients(self):
        if self.active_:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                self.sync_metrc_patient(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Patients.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_packages(self):
        if self.active_:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                self.sync_metrc_package(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Packages.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility(self):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/facilities/" + self.api_version + "/"
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                for facility in response_list:
                    facility_obj = self.env['metrc.facility'].sudo().search([('name', '=', facility['Name'])], limit=1)
                    if facility_obj:
                        facility_obj.sudo().write({
                            'alias': facility['Alias'] if facility['Alias'] else '',
                            'display_name': facility['DisplayName'] if facility['DisplayName'] else '',
                            'license_number': facility['License']['Number'] if facility['License']['Number'] else '',
                            'license_type': facility['License']['LicenseType'] if facility['License'][
                                'LicenseType'] else '',
                            'hire_date': facility['HireDate'] if facility['HireDate'] else '',
                            'cred_date': facility['CredentialedDate'] if facility['CredentialedDate'] else '',
                            'lic_start_date': facility['License']['StartDate'] if facility['License'][
                                'StartDate'] else '',
                            'lic_end_date': facility['License']['EndDate'] if facility['License']['EndDate'] else '',
                            'is_owner': True if facility['IsOwner'] else False,
                            'is_manager': True if facility['IsManager'] else False,
                        })
                    else:
                        facility_obj = self.env['metrc.facility'].sudo().create({
                            'name': facility['Name'] if facility['Name'] else '',
                            'alias': facility['Alias'] if facility['Alias'] else '',
                            'display_name': facility['DisplayName'] if facility['DisplayName'] else '',
                            'license_number': facility['License']['Number'] if facility['License']['Number'] else '',
                            'license_type': facility['License']['LicenseType'] if facility['License'][
                                'LicenseType'] else '',
                            'hire_date': facility['HireDate'] if facility['HireDate'] else '',
                            'cred_date': facility['CredentialedDate'] if facility['CredentialedDate'] else '',
                            'lic_start_date': facility['License']['StartDate'] if facility['License'][
                                'StartDate'] else '',
                            'lic_end_date': facility['License']['EndDate'] if facility['License']['EndDate'] else '',
                            'is_owner': True if facility['IsOwner'] else False,
                            'is_manager': True if facility['IsManager'] else False,
                        })
                    warehouse_obj = self.env['stock.warehouse'].sudo().search([('name', '=', facility['Name'])],
                                                                              limit=1)
                    warehouse_count = len(self.env['stock.warehouse'].sudo().search([]))
                    if warehouse_obj:
                        warehouse_obj.facility_id = facility_obj.id
                    else:
                        warehouse_obj = self.env['stock.warehouse'].sudo().create({
                            "name": facility_obj.name,
                            "code": "WH" + str(warehouse_count + 1),
                            "facility_id": facility_obj.id,
                            "delivery_steps": 'ship_only',
                            "reception_steps": 'one_step',
                            "company_id": self.env.company.id,
                        })

                self.env.cr.commit()
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Facilities.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_customer_types(self):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/sales/" + self.api_version + "/customertypes"
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                if response.json():
                    for item in response.json():
                        cus_type = self.env['metrc.customer.type'].sudo().search([('name', '=', item)], limit=1)
                        if cus_type:
                            pass
                        else:
                            self.env['metrc.customer.type'].sudo().create({'name': item})
            return self.env['metrc.message.wizard'].sudo().popup_message('Success',
                                                                         'Successfully Synced Customer Types.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_location_types(self):
        account = self.sudo().search([('active_', '=', True)], limit=1)
        if account:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                account.sync_metrc_location_types(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success',
                                                                         'Successfully Synced Location Types.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_locations(self):
        account = self.sudo().search([('active_', '=', True)], limit=1)
        if account:
            facilities = self.env['metrc.facility'].sudo().search([])
            for facility in facilities:
                account.sync_metrc_locations(facility)
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Locations.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_uom(self):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/unitsofmeasure/" + self.api_version + "/active"
            response = requests.get(url=url, headers=headers)
            if response.status_code == 200:
                response_string = ""
                for line in response:
                    response_string += line.decode("UTF-8")
                response_list = json.loads(response_string)
                for uom in response_list:
                    qty_type = uom['QuantityType'].replace("Based", "")
                    category_id = self.env['uom.category'].sudo().search([('name', '=', qty_type)], limit=1)
                    new = False
                    if category_id:
                        pass
                    else:
                        category_id = self.env['uom.category'].sudo().create({
                            'name': qty_type,
                            'is_pos_groupable': True,
                        })
                        new = True
                    uom_id = self.env['uom.uom'].sudo().search([('name', '=', uom['Abbreviation'])], limit=1)
                    if uom_id:
                        uom_id.sudo().write({
                            'metrc_name': uom['Name'],
                            'metrc_qty_type': uom['QuantityType']
                        })
                    else:
                        if new:
                            uom_id = self.env['uom.uom'].sudo().create({
                                'name': uom['Abbreviation'],
                                'metrc_name': uom['Name'],
                                'metrc_qty_type': uom['QuantityType'],
                                'category_id': category_id.id,
                            })
                        else:
                            uom_id = self.env['uom.uom'].sudo().create({
                                'name': uom['Abbreviation'],
                                'metrc_name': uom['Name'],
                                'metrc_qty_type': uom['QuantityType'],
                                'category_id': category_id.id,
                                'uom_type': 'smaller'
                            })
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced UOM.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_pos_order(self, order):
        metrc_account = self.sudo().search([('active_', '=', True)], limit=1)
        if metrc_account:
            headers = self.get_header()
            url = metrc_account.url + "/sales/" + metrc_account.api_version + "/receipts?licenseNumber=" + \
                  order.config_id.facility_id.license_number
            transactions = []
            for line in order.lines:
                for lot in line.pack_lot_ids:
                    line_d = {
                        "PackageLabel": lot.lot_name,
                        "Quantity": line.qty,
                        "UnitOfMeasure": line.product_id.u_o_m,
                        "TotalAmount": line.price_subtotal_incl
                    }
                    transactions.append(line_d)
            text = [
                {
                    "SalesDateTime": order.date_order.strftime(
                        "%Y-%m-%dT%H:%M:%S") if order.date_order else datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                    "SalesCustomerType": order.partner_id.customer_type.name if order.partner_id.customer_type else 'Consumer',
                    "PatientLicenseNumber": order.partner_id.patient_lic_num if order.partner_id.patient_lic_num else None,
                    "CaregiverLicenseNumber": order.partner_id.caregiver_lic_num if order.partner_id.caregiver_lic_num else None,
                    "IdentificationMethod": order.partner_id.identification_method if order.partner_id.identification_method else None,
                    "Transactions": transactions
                }
            ]
            data = json.dumps(text)
            response = requests.post(url=url, headers=headers, data=data)
            order.metrc_synced = True
            self.env['metrc.log'].sudo().create({
                'res_name': order.name,
                'res_model': 'pos.order',
                'operation': 'PoS Order to METRC Sync',
                'full_url': 'POST ' + url,
                'data': data,
                'response': str(response.status_code),
                'account_id': metrc_account.id,
            })
            self.env.cr.commit()

    def sync_sale_order(self, order):
        sale_order = self.env['sale.order'].sudo().search([('name', '=', order.origin)])
        if sale_order and sale_order.website_id:
            metrc_account = self.sudo().search([('active_', '=', True)], limit=1)
            if metrc_account:
                headers = self.get_header()
                url = metrc_account.url + "/sales/" + metrc_account.api_version + "/receipts?licenseNumber=" + \
                      sale_order.website_id.facility_id.license_number
                transactions = []
                for line in order.move_line_ids_without_package:
                    taxes = line.product_id.taxes_id
                    subtotal_amount = line.product_id.lst_price * line.qty_done
                    total = subtotal_amount
                    for tax in taxes:
                        if tax.amount > 0.0 and total > 0.0:
                            subtotal_amount += (total * tax.amount) / 100
                    line_d = {
                        "PackageLabel": line.lot_id.name,
                        "Quantity": line.qty_done,
                        "UnitOfMeasure": line.product_id.u_o_m,
                        "TotalAmount": subtotal_amount
                    }
                    transactions.append(line_d)
                text = [
                    {
                        "SalesDateTime": sale_order.date_order.strftime(
                            "%Y-%m-%dT%H:%M:%S") if sale_order.date_order else datetime.now().strftime(
                            "%Y-%m-%dT%H:%M:%S"),
                        "SalesCustomerType": sale_order.partner_id.customer_type.name if sale_order.partner_id.customer_type else 'Consumer',
                        "PatientLicenseNumber": sale_order.partner_id.patient_lic_num if sale_order.partner_id.patient_lic_num else None,
                        "CaregiverLicenseNumber": sale_order.partner_id.caregiver_lic_num if sale_order.partner_id.caregiver_lic_num else None,
                        "IdentificationMethod": sale_order.partner_id.identification_method if sale_order.partner_id.identification_method else None,
                        "Transactions": transactions
                    }
                ]
                data = json.dumps(text)
                response = requests.post(url=url, headers=headers, data=data)
                order.metrc_synced = True
                self.env['metrc.log'].sudo().create({
                    'res_name': sale_order.name,
                    'res_model': 'sale.order',
                    'operation': 'Sale Order to METRC Sync',
                    'full_url': 'POST ' + url,
                    'data': data,
                    'response': str(response.status_code),
                    'account_id': metrc_account.id,
                })
                self.env.cr.commit()

    def sync_metrc_pos_orders(self, facility):
        if self.active_:
            orders = self.env['pos.order'].sudo().search(
                [('metrc_synced', '=', False), ('state', 'not in', ['draft', 'cancel'])])
            for order in orders:
                if order.config_id.facility_id.id == facility.id:
                    self.sync_pos_order(order)
            return True
        else:
            return False

    def all_pos_order_sync(self):
        orders = self.env['pos.order'].search([('metrc_synced', '=', False), ('state', 'not in', ['draft', 'cancel'])])
        for order in orders:
            self.sync_pos_order(order)

    def all_sale_order_sync(self):
        orders = self.env['stock.picking'].search([('do_metrc_synced', '=', False), ('state', '=', 'done'),
                                                   ('picking_type_code', '=', 'outgoing')])
        for order in orders:
            if order.origin:
                if order.origin[0] == 'S':
                    self.sync_sale_order(order)
            self.sync_pos_order(order)

    def sync_metrc_facility_pos_order(self):
        if self.active_:
            self.all_pos_order_sync()
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced PoS Orders.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    def sync_metrc_facility_sale_order(self):
        if self.active_:
            self.all_sale_order_sync()
            return self.env['metrc.message.wizard'].sudo().popup_message('Success', 'Successfully Synced Sale Orders.')
        else:
            return self.env['metrc.message.wizard'].sudo().popup_message('Failed', 'Please activate the account.')

    # def sync_w2w_internal_transfer(self, transfer, license):
    #     if self.active_:
    #         headers = self.get_header()
    #         url = self.url + "/transfers/" + self.api_version + "/external/incoming?licenseNumber=" + license
    #         location = transfer.location_dest_id.name
    #         packages = []
    #         for package in transfer.move_line_ids_without_package:
    #             packages.append(
    #                 {
    #                     "Label": package.lot_id.name,
    #                     "Location": location,
    #                     "MoveDate": transfer.date_done.strftime("%Y-%m-%d")
    #                 }
    #             )
    #         text = [
    #             {
    #                 "ShipperLicenseNumber": "123-ABC",
    #                 "ShipperName": "Lofty Med-Cultivation B",
    #                 "ShipperMainPhoneNumber": "123-456-7890",
    #                 "ShipperAddress1": "123 Real Street",
    #                 "ShipperAddress2": null,
    #                 "ShipperAddressCity": "Somewhere",
    #                 "ShipperAddressState": "CO",
    #                 "ShipperAddressPostalCode": null,
    #                 "TransporterFacilityLicenseNumber": null,
    #                 "DriverOccupationalLicenseNumber": null,
    #                 "DriverName": null,
    #                 "DriverLicenseNumber": null,
    #                 "PhoneNumberForQuestions": null,
    #                 "VehicleMake": null,
    #                 "VehicleModel": null,
    #                 "VehicleLicensePlateNumber": null,
    #                 "Destinations": [
    #                     {
    #                         "RecipientLicenseNumber": "123-XYZ",
    #                         "TransferTypeName": "Transfer",
    #                         "PlannedRoute": "I will drive down the road to the place.",
    #                         "EstimatedDepartureDateTime": "2018-03-06T09:15:00.000",
    #                         "EstimatedArrivalDateTime": "2018-03-06T12:24:00.000",
    #                         "GrossWeight": null,
    #                         "GrossUnitOfWeightId": null,
    #                         "Transporters": [
    #                             {
    #                                 "TransporterFacilityLicenseNumber": "123-ABC",
    #                                 "DriverOccupationalLicenseNumber": "50",
    #                                 "DriverName": "X",
    #                                 "DriverLicenseNumber": "5",
    #                                 "PhoneNumberForQuestions": "18005555555",
    #                                 "VehicleMake": "X",
    #                                 "VehicleModel": "X",
    #                                 "VehicleLicensePlateNumber": "X",
    #                                 "IsLayover": false,
    #                                 "EstimatedDepartureDateTime": "2018-03-06T12:00:00.000",
    #                                 "EstimatedArrivalDateTime": "2018-03-06T21:00:00.000",
    #                                 "TransporterDetails": null
    #                             }
    #                         ],
    #                         "Packages": packages
    #                     }
    #                 ]
    #             }
    #         ]
    #         data = json.dumps(text)
    #         return True
    #     else:
    #         return False

    def sync_internal_transfer(self, transfer, license):
        if self.active_:
            headers = self.get_header()
            url = self.url + "/packages/" + self.api_version + "/change/locations?licenseNumber=" + license
            location = transfer.location_dest_id.name
            packages = []
            for package in transfer.move_line_ids_without_package:
                packages.append(
                    {
                        "Label": package.lot_id.name,
                        "Location": location,
                        "MoveDate": datetime.now().strftime("%Y-%m-%d")
                    }
                )
            text = packages
            data = json.dumps(text)
            if packages:
                response = requests.post(url=url, headers=headers, data=data)
                self.env['metrc.log'].sudo().create({
                    'res_name': transfer.name,
                    'res_model': 'stock.picking',
                    'operation': 'Internal Transfer to METRC Sync',
                    'full_url': 'POST ' + url,
                    'data': data,
                    'response': str(response.status_code),
                    'account_id': self.id,
                })
                self.env.cr.commit()
            else:
                self.env['metrc.log'].sudo().create({
                    'res_name': transfer.name,
                    'res_model': 'stock.picking',
                    'operation': 'Internal Transfer to METRC Sync',
                    'full_url': 'POST ' + url,
                    'data': data,
                    'response': 'No Packages',
                    'account_id': self.id,
                })
                self.env.cr.commit()
            return True
        else:
            return False
