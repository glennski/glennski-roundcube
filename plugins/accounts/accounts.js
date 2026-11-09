/**
 * Accounts plugin: mailbox list actions, server detection and provider presets.
 */
window.rcmail && rcmail.addEventListener('init', function () {
    var token = rcmail.env.accounts_token;

    $('#accounts-list').on('click', 'a[data-action]', function (e) {
        var action = $(this).data('action'), id = $(this).data('id');

        e.preventDefault();

        if (action === 'switch') {
            // full page: the whole UI changes to the other mailbox
            window.top.location = './?_task=settings&_action=plugin.accounts-switch&_id=' + id + '&_token=' + encodeURIComponent(token);
            return;
        }
        if (action === 'delete' && !window.confirm(rcmail.env.accounts_confirm)) {
            return;
        }

        $('<form method="post"></form>')
            .attr('action', './?_task=settings&_action=plugin.accounts-' + action)
            .append($('<input type="hidden" name="_token">').val(token))
            .append($('<input type="hidden" name="_id">').val(id))
            .appendTo(document.body)
            .submit();
    });

    $('#accounts-detect').on('click', function (e) {
        e.preventDefault();
        $('#accounts-detect-result').text('…');
        rcmail.http_post('plugin.accounts-detect', { _email: $('#accemail').val() });
    });

    rcmail.addEventListener('plugin.accounts_detected', function (r) {
        if (r) {
            $('#accimap_host').val(r.imap_host);
            $('#accsmtp_host').val(r.smtp_host);
            // only needed when the login name differs from the address
            $('#accimap_user').val(r.imap_user === $('#accemail').val() ? '' : r.imap_user);
        }
        $('#accounts-detect-result').text(rcmail.get_label(r ? 'detected' : 'notdetected', 'accounts'));
    });

    $('#accounts-presets').on('click', 'a[data-preset]', function (e) {
        var hosts = $(this).data('preset').split('|');

        e.preventDefault();
        $('#accimap_host').val(hosts[0]);
        $('#accsmtp_host').val(hosts[1]);
        $('#accpassword').focus();
    });
});
