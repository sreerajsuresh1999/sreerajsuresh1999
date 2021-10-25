odoo.define('pos_retail.CashierName', function (require) {
    'use strict';

    const CashierName = require('point_of_sale.CashierName');
    const Registries = require('point_of_sale.Registries');

    const RetailCashierName = (CashierName) =>
        class extends CashierName {
            constructor() {
                super(...arguments);
            }

            get getImage() {
                let cashier = this.env.pos.get('cashier');
                if (this.env.pos.config.module_pos_hr && this.env.pos.config.employee_ids && this.env.pos.config.employee_ids) {
                    if (cashier['id']) {
                        return `/web/image?model=hr.employee&id=${cashier['id']}&field=image_128&unique=1`;
                    } else {
                        return `/web/image?model=res.users&id=${cashier['user_id'][0]}&field=image_128&unique=1`;
                    }
                } else {
                    if (!cashier['id'] && cashier['user_id']) {
                        return `/web/image?model=res.users&id=${cashier['user_id'][0]}&field=image_128&unique=1`;
                    } else {
                        return `/web/image?model=res.users&id=${cashier['id']}&field=image_128&unique=1`;
                    }
                }
            }

            async selectCashier() {
                if (!this.env.pos.config.module_pos_hr) return;

                const list = this.env.pos.employees
                    .filter((employee) => employee.id !== this.env.pos.get_cashier().id)
                    .map((employee) => {
                        return {
                            id: employee.id,
                            item: employee,
                            label: employee.name,
                            isSelected: false,
                            imageUrl: 'data:image/png;base64, ' + employee['image_1920'],
                        };
                    });

                const employee = await this.selectEmployee(list);
                if (employee) {
                    employee['is_employee'] = true
                    this.env.pos.set_cashier(employee);
                }
            }
        }
    Registries.Component.extend(CashierName, RetailCashierName);

    return RetailCashierName;
});
