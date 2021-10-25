import xlsxwriter
import base64
from odoo import fields, models, api
from io import BytesIO
from datetime import datetime
from pytz import timezone
import pytz


class ReportStockExcel(models.TransientModel):
    _name = "report.stock.excel"
    _description = "Stock Report .xlsx"

    @api.model
    def get_default_date_model(self):
        return pytz.UTC.localize(datetime.now()).astimezone(timezone(self.env.user.tz or 'UTC'))

    datas = fields.Binary('File', readonly=True)
    datas_fname = fields.Char('Filename', readonly=True)
    product_ids = fields.Many2many(
        'product.product',
        'excel_report_stock_product_rel',
        'excel_report_stock_id',
        'product_id',
        'Products')
    categ_ids = fields.Many2many(
        'pos.category',
        'excel_report_stock_categ_rel',
        'excel_report_stock_id',
        'categ_id',
        'POS Categories')
    location_ids = fields.Many2many(
        'stock.location',
        'excel_report_stock_location_rel',
        'excel_report_stock_id',
        'location_id',
        'Locations')

    def print_excel_report(self):
        data = self.read()[0]
        product_ids = data['product_ids']
        categ_ids = data['categ_ids']
        location_ids = data['location_ids']

        if categ_ids:
            product_ids = self.env['product.product'].search([('pos_categ_id', 'in', categ_ids)])
            product_ids = [prod.id for prod in product_ids]
        where_product_ids = " 1=1 "
        if product_ids:
            where_product_ids = " quant.product_id in %s" % str(tuple(product_ids)).replace(',)', ')')
        location_ids2 = self.env['stock.location'].search([('usage', '=', 'internal')])
        ids_location = [loc.id for loc in location_ids2]
        where_location_ids = " quant.location_id in %s" % str(tuple(ids_location)).replace(',)', ')')
        if location_ids:
            where_location_ids = " quant.location_id in %s" % str(tuple(location_ids)).replace(',)', ')')

        datetime_string = self.get_default_date_model().strftime("%Y-%m-%d %H:%M:%S")
        date_string = self.get_default_date_model().strftime("%Y-%m-%d")
        report_name = 'Stock On Hand Analytic Report'
        filename = '%s %s' % (report_name, date_string)

        columns = [
            ('No', 5, 'no', 'no'),
            ('Default Code', 30, 'char', 'char'),
            ('Barcode', 30, 'char', 'char'),
            ('Product', 30, 'char', 'char'),
            ('POS Category', 20, 'char', 'char'),
            ('Location', 30, 'char', 'char'),
            ('Incoming Date', 20, 'datetime', 'char'),
            ('Stock Age', 20, 'number', 'char'),
            ('Total Stock', 20, 'float', 'float'),
            ('Available', 20, 'float', 'float'),
            ('Reserved', 20, 'float', 'float'),
        ]

        datetime_format = '%Y-%m-%d %H:%M:%S'
        utc = datetime.now().strftime(datetime_format)
        utc = datetime.strptime(utc, datetime_format)
        tz = self.get_default_date_model().strftime(datetime_format)
        tz = datetime.strptime(tz, datetime_format)
        duration = tz - utc
        hours = duration.seconds / 60 / 60
        if hours > 1 or hours < 1:
            hours = str(hours) + ' hours'
        else:
            hours = str(hours) + ' hour'

        query = """
            SELECT 
                        prod.default_code AS default_code,
                        prod.barcode AS barcode,
                        prod_tmpl.name AS product, 
                        categ.name AS prod_categ, 
                        loc.complete_name AS location,
                        quant.in_date + interval '%s' AS date_in, 
                        date_part('days', now() - (quant.in_date + interval '%s')) AS aging,
                        sum(quant.quantity) AS total_product, 
                        sum(quant.quantity-quant.reserved_quantity) AS stock, 
                        sum(quant.reserved_quantity) AS reserved
            FROM 
                        stock_quant quant
            LEFT JOIN 
                        stock_location loc ON loc.id=quant.location_id
            LEFT JOIN 
                        product_product prod ON prod.id=quant.product_id
            LEFT JOIN 
                        product_template prod_tmpl ON prod_tmpl.id=prod.product_tmpl_id
            LEFT JOIN 
                        pos_category categ ON categ.id=prod_tmpl.pos_categ_id
            WHERE 
                        prod_tmpl.sale_ok is True AND prod_tmpl.type='consu' AND prod.available_in_pos is True AND %s AND %s  
            GROUP BY 
                        product, prod_categ, location, date_in, prod.default_code, prod.barcode
            ORDER BY 
                        date_in
        """

        self._cr.execute(query % (hours, hours, where_product_ids, where_location_ids))
        result = self._cr.fetchall()

        fp = BytesIO()
        workbook = xlsxwriter.Workbook(fp)
        wbf, workbook = self.add_workbook_format(workbook)

        worksheet = workbook.add_worksheet(report_name)
        worksheet.merge_range('A2:I3', report_name, wbf['title_doc'])

        row = 5

        col = 0
        for column in columns:
            column_name = column[0]
            column_width = column[1]
            column_type = column[2]
            worksheet.set_column(col, col, column_width)
            worksheet.write(row - 1, col, column_name, wbf['header_orange'])
            col += 1

        row += 1
        row1 = row
        no = 1

        column_float_number = {}
        for res in result:
            col = 0
            for column in columns:
                column_name = column[0]
                column_width = column[1]
                column_type = column[2]
                if column_type == 'char':
                    col_value = res[col - 1] if res[col - 1] else ''
                    wbf_value = wbf['content']
                elif column_type == 'no':
                    col_value = no
                    wbf_value = wbf['content']
                elif column_type == 'datetime':
                    col_value = res[col - 1].strftime('%Y-%m-%d %H:%M:%S') if res[col - 1] else ''
                    wbf_value = wbf['content']
                else:
                    col_value = res[col - 1] if res[col - 1] else 0
                    if column_type == 'float':
                        wbf_value = wbf['content_float']
                    else:  # number
                        wbf_value = wbf['content_number']
                    column_float_number[col] = column_float_number.get(col, 0) + col_value

                worksheet.write(row - 1, col, col_value, wbf_value)
                col += 1
            row += 1
            no += 1

        worksheet.merge_range('A%s:B%s' % (row, row), 'Grand Total', wbf['total_orange'])
        for x in range(len(columns)):
            if x in (0, 1):
                continue
            column_type = columns[x][3]
            if column_type == 'char':
                worksheet.write(row - 1, x, '', wbf['total_orange'])
            else:
                if column_type == 'float':
                    wbf_value = wbf['total_float_orange']
                else:  # number
                    wbf_value = wbf['total_number_orange']
                if x in column_float_number:
                    worksheet.write(row - 1, x, column_float_number[x], wbf_value)
                else:
                    worksheet.write(row - 1, x, 0, wbf_value)

        worksheet.write('A%s' % (row + 2), 'Date %s (%s)' % (datetime_string, self.env.user.tz or 'UTC'),
                        wbf['content_datetime'])
        workbook.close()
        out = base64.encodestring(fp.getvalue())
        self.write({'datas': out, 'datas_fname': filename})
        fp.close()
        filename += '%2Exlsx'

        return {
            'type': 'ir.actions.act_url',
            'target': 'new',
            'url': 'web/content/?model=' + self._name + '&id=' + str(
                self.id) + '&field=datas&download=true&filename=' + filename,
        }

    def add_workbook_format(self, workbook):
        colors = {
            'white_orange': '#FFFFDB',
            'orange': '#FFC300',
            'red': '#FF0000',
            'yellow': '#F6FA03',
        }

        wbf = {}
        wbf['header'] = workbook.add_format(
            {'bold': 1, 'align': 'center', 'bg_color': '#FFFFDB', 'font_color': '#000000', 'font_name': 'Georgia'})
        wbf['header'].set_border()

        wbf['header_orange'] = workbook.add_format(
            {'bold': 1, 'align': 'center', 'bg_color': colors['orange'], 'font_color': '#000000',
             'font_name': 'Georgia'})
        wbf['header_orange'].set_border()

        wbf['header_yellow'] = workbook.add_format(
            {'bold': 1, 'align': 'center', 'bg_color': colors['yellow'], 'font_color': '#000000',
             'font_name': 'Georgia'})
        wbf['header_yellow'].set_border()

        wbf['header_no'] = workbook.add_format(
            {'bold': 1, 'align': 'center', 'bg_color': '#FFFFDB', 'font_color': '#000000', 'font_name': 'Georgia'})
        wbf['header_no'].set_border()
        wbf['header_no'].set_align('vcenter')

        wbf['footer'] = workbook.add_format({'align': 'left', 'font_name': 'Georgia'})

        wbf['content_datetime'] = workbook.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss', 'font_name': 'Georgia'})
        wbf['content_datetime'].set_left()
        wbf['content_datetime'].set_right()

        wbf['content_date'] = workbook.add_format({'num_format': 'yyyy-mm-dd', 'font_name': 'Georgia'})
        wbf['content_date'].set_left()
        wbf['content_date'].set_right()

        wbf['title_doc'] = workbook.add_format({
            'bold': True,
            'align': 'center',
            'valign': 'vcenter',
            'font_size': 20,
            'font_name': 'Georgia',
        })

        wbf['company'] = workbook.add_format({'align': 'left', 'font_name': 'Georgia'})
        wbf['company'].set_font_size(11)

        wbf['content'] = workbook.add_format()
        wbf['content'].set_left()
        wbf['content'].set_right()

        wbf['content_float'] = workbook.add_format({'align': 'right', 'num_format': '#,##0.00', 'font_name': 'Georgia'})
        wbf['content_float'].set_right()
        wbf['content_float'].set_left()

        wbf['content_number'] = workbook.add_format({'align': 'right', 'num_format': '#,##0', 'font_name': 'Georgia'})
        wbf['content_number'].set_right()
        wbf['content_number'].set_left()

        wbf['content_percent'] = workbook.add_format({'align': 'right', 'num_format': '0.00%', 'font_name': 'Georgia'})
        wbf['content_percent'].set_right()
        wbf['content_percent'].set_left()

        wbf['total_float'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['white_orange'], 'align': 'right', 'num_format': '#,##0.00',
             'font_name': 'Georgia'})
        wbf['total_float'].set_top()
        wbf['total_float'].set_bottom()
        wbf['total_float'].set_left()
        wbf['total_float'].set_right()

        wbf['total_number'] = workbook.add_format(
            {'align': 'right', 'bg_color': colors['white_orange'], 'bold': 1, 'num_format': '#,##0',
             'font_name': 'Georgia'})
        wbf['total_number'].set_top()
        wbf['total_number'].set_bottom()
        wbf['total_number'].set_left()
        wbf['total_number'].set_right()

        wbf['total'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['white_orange'], 'align': 'center', 'font_name': 'Georgia'})
        wbf['total'].set_left()
        wbf['total'].set_right()
        wbf['total'].set_top()
        wbf['total'].set_bottom()

        wbf['total_float_yellow'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['yellow'], 'align': 'right', 'num_format': '#,##0.00',
             'font_name': 'Georgia'})
        wbf['total_float_yellow'].set_top()
        wbf['total_float_yellow'].set_bottom()
        wbf['total_float_yellow'].set_left()
        wbf['total_float_yellow'].set_right()

        wbf['total_number_yellow'] = workbook.add_format(
            {'align': 'right', 'bg_color': colors['yellow'], 'bold': 1, 'num_format': '#,##0', 'font_name': 'Georgia'})
        wbf['total_number_yellow'].set_top()
        wbf['total_number_yellow'].set_bottom()
        wbf['total_number_yellow'].set_left()
        wbf['total_number_yellow'].set_right()

        wbf['total_yellow'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['yellow'], 'align': 'center', 'font_name': 'Georgia'})
        wbf['total_yellow'].set_left()
        wbf['total_yellow'].set_right()
        wbf['total_yellow'].set_top()
        wbf['total_yellow'].set_bottom()

        wbf['total_float_orange'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['orange'], 'align': 'right', 'num_format': '#,##0.00',
             'font_name': 'Georgia'})
        wbf['total_float_orange'].set_top()
        wbf['total_float_orange'].set_bottom()
        wbf['total_float_orange'].set_left()
        wbf['total_float_orange'].set_right()

        wbf['total_number_orange'] = workbook.add_format(
            {'align': 'right', 'bg_color': colors['orange'], 'bold': 1, 'num_format': '#,##0', 'font_name': 'Georgia'})
        wbf['total_number_orange'].set_top()
        wbf['total_number_orange'].set_bottom()
        wbf['total_number_orange'].set_left()
        wbf['total_number_orange'].set_right()

        wbf['total_orange'] = workbook.add_format(
            {'bold': 1, 'bg_color': colors['orange'], 'align': 'center', 'font_name': 'Georgia'})
        wbf['total_orange'].set_left()
        wbf['total_orange'].set_right()
        wbf['total_orange'].set_top()
        wbf['total_orange'].set_bottom()

        wbf['header_detail_space'] = workbook.add_format({'font_name': 'Georgia'})
        wbf['header_detail_space'].set_left()
        wbf['header_detail_space'].set_right()
        wbf['header_detail_space'].set_top()
        wbf['header_detail_space'].set_bottom()

        wbf['header_detail'] = workbook.add_format({'bg_color': '#E0FFC2', 'font_name': 'Georgia'})
        wbf['header_detail'].set_left()
        wbf['header_detail'].set_right()
        wbf['header_detail'].set_top()
        wbf['header_detail'].set_bottom()

        return wbf, workbook
