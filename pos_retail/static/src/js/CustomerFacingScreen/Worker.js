$(function () {
    "use strict";
    // mergedHead will be turned to true the first time we receive something from a new host
    // It allows to transform the <head> only once
    var mergedHead = false;
    var current_client_url = "";
    var stop_longpolling = false;

    function reload_facing_screen() {
        window.addEventListener("storage", function (event) {
            var msg = event.data;
            if (event.key === 'facing_screen' && event.newValue) {
                var trimmed = $.trim(event.newValue);
                var $parsedHTML = $('<div>').html($.parseHTML(trimmed, true)); // WARNING: the true here will executes any script present in the string to parse
                var new_client_url = $parsedHTML.find(".resources > base").attr('href');

                current_client_url = new_client_url;
                $("body").removeClass('original_body').addClass('ajax_got_body');
                $("head").children().not('.origin').remove();
                $("head").append($parsedHTML.find(".resources").html());
                $("body").html(trimmed);

                $(".container").html($parsedHTML.find('.pos-customer_facing_display').html());
                $(".container").attr('class', 'container').addClass($parsedHTML.find('.pos-customer_facing_display').attr('class'));

                var d = $('.pos_orderlines_list');
                d.scrollTop(d.prop("scrollHeight"));

                // Here we execute the code coming from the pos, apparently $.parseHTML() executes scripts right away,
                // Since we modify the dom afterwards, the script might not have any effect
                if (typeof foreign_js !== 'undefined' && $.isFunction(foreign_js)) {
                    foreign_js();
                }
            }

        }, false);
    };

    reload_facing_screen();
});