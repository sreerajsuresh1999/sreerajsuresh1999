// odoo.define('pos_retail.BackToFloorButton', function (require) {
//     'use strict';
//
//     const BackToFloorButton = require('pos_restaurant.BackToFloorButton');
//     const Registries = require('point_of_sale.Registries');
//
//     const RetailBackToFloorButton = (BackToFloorButton) =>
//         class extends BackToFloorButton {
//             async backToFloorScreen() {
//                 if (this.env.pos.config.auto_order) {
//                     let selectedOrder = this.env.pos.get_order();
//                     if (selectedOrder.hasChangesToPrint()) {
//                         const isPrintSuccessful = await selectedOrder.printChanges();
//                         if (isPrintSuccessful) {
//                             selectedOrder.saveChanges();
//                         }
//                     }
//                 }
//                 super.backToFloorScreen()
//             }
//         }
//     Registries.Component.extend(BackToFloorButton, RetailBackToFloorButton);
//
//     return RetailBackToFloorButton;
// });

odoo.define('pos_retail.BackToFloorButton', function (require) {
    'use strict';

    const BackToFloorButton = require('pos_restaurant.BackToFloorButton');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailBackToFloorButton = (BackToFloorButton) =>
        class extends BackToFloorButton {
            backToFloorScreen() {
                posbus.trigger('set-screen', 'Floors')
            }
        }
    Registries.Component.extend(BackToFloorButton, RetailBackToFloorButton);

    return RetailBackToFloorButton;
});

