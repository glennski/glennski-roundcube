<?php

/*
 +-----------------------------------------------------------------------+
 | This file is part of the Roundcube Webmail client                     |
 |                                                                       |
 | Licensed under the GNU General Public License version 3 or            |
 | any later version with exceptions for skins & plugins.                |
 | See the README file for a full license statement.                     |
 |                                                                       |
 | PURPOSE:                                                              |
 |   JSON API: folders, messages, attachments, sending.                  |
 +-----------------------------------------------------------------------+
*/

class rcmail_api_mail
{
    /** 1x1 transparent GIF, shown instead of blocked remote images */
    protected const BLOCKED_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    /** image types that are safe to display inline (never SVG: it can carry script) */
    protected const INLINE_IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'];

    protected rcmail $rc;

    public function __construct(protected rcmail_api $api)
    {
        $this->rc = $api->rc;
    }

    // ---- folders --------------------------------------------------------

    public function folders(): array
    {
        $storage = $this->api->storage();
        $special = $storage->get_special_folders();
        $archive = $this->rc->config->get('archive_mbox');
        $delimiter = $storage->get_hierarchy_delimiter();
        $out = [];

        foreach ($storage->list_folders_subscribed('', '*', 'mail') as $name) {
            $role = strtoupper($name) === 'INBOX' ? 'inbox' : (array_search($name, $special, true) ?: ($name === $archive ? 'archive' : null));
            $status = $this->status($storage, $name);

            $out[] = [
                'name' => $name,
                'label' => ($pos = strrpos($name, $delimiter)) === false ? $name : substr($name, $pos + strlen($delimiter)),
                'parent' => ($pos = strrpos($name, $delimiter)) === false ? null : substr($name, 0, $pos),
                'role' => $role,
                'unseen' => $status['unseen'],
                'total' => $status['total'],
            ];
        }

        $quota = $storage->get_capability('QUOTA') ? $storage->get_quota() : null;

        return ['delimiter' => $delimiter, 'folders' => $out, 'quota' => $quota ? [
            'used' => $quota['used'] ?? null, 'total' => $quota['total'] ?? null, 'percent' => $quota['percent'] ?? null,
        ] : null];
    }

    public function folder_create(): array
    {
        $storage = $this->api->storage();
        $name = trim($this->api->string('name', null, true));
        $parent = $this->api->string('parent');
        $full = $parent ? $parent . $storage->get_hierarchy_delimiter() . $name : $name;

        if (!$storage->create_folder($full, true)) {
            throw new rcmail_api_exception(409, 'folder_error', 'The folder could not be created');
        }

        return ['name' => $full];
    }

    public function folder_rename(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', null, true);
        $new = trim($this->api->string('name', null, true));
        $delimiter = $storage->get_hierarchy_delimiter();
        $parent = ($pos = strrpos($folder, $delimiter)) === false ? '' : substr($folder, 0, $pos + strlen($delimiter));

        if ($this->is_special($storage, $folder) || !$storage->rename_folder($folder, $parent . $new)) {
            throw new rcmail_api_exception(409, 'folder_error', 'The folder could not be renamed');
        }

        return ['name' => $parent . $new];
    }

    public function folder_delete(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', null, true);

        if ($this->is_special($storage, $folder) || !$storage->delete_folder($folder)) {
            throw new rcmail_api_exception(409, 'folder_error', 'The folder could not be deleted');
        }

        return ['ok' => true];
    }

    /**
     * Remove all messages of a folder (trash and spam only).
     */
    public function folder_empty(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', null, true);
        $special = $storage->get_special_folders();

        if (!in_array($folder, array_filter([$special['trash'] ?? null, $special['junk'] ?? null]), true)) {
            throw new rcmail_api_exception(400, 'not_allowed', 'Only the trash and spam folders can be emptied');
        }

        $storage->clear_folder($folder);

        return ['ok' => true];
    }

    // ---- message list ---------------------------------------------------

    public function messages(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', 'INBOX');
        $page = max(1, $this->api->int('page', 1));
        $per_page = min(100, max(10, $this->api->int('per_page', (int) $this->rc->config->get('mail_pagesize', 50))));
        $sort = in_array($this->api->string('sort', 'date'), ['date', 'arrival', 'subject', 'from', 'size'], true) ? $this->api->string('sort', 'date') : 'date';
        $order = strtoupper($this->api->string('order', 'DESC')) === 'ASC' ? 'ASC' : 'DESC';
        $q = trim((string) $this->api->string('q', ''));
        $filter = $this->api->string('filter', 'all');

        if (!$storage->folder_exists($folder)) {
            throw new rcmail_api_exception(404, 'folder_not_found', 'Unknown folder');
        }

        $criteria = [];
        if ($q !== '') {
            $criteria[] = 'TEXT ' . rcube_imap_generic::escape($q);
        }
        if ($filter === 'unseen') {
            $criteria[] = 'UNSEEN';
        } elseif ($filter === 'flagged') {
            $criteria[] = 'FLAGGED';
        }

        // the search set and the count only apply to the current folder
        $storage->set_folder($folder);
        $storage->set_pagesize($per_page);
        $storage->set_page($page);

        if ($criteria) {
            $storage->search($folder, implode(' ', $criteria), 'UTF-8', $sort);
        } else {
            $storage->set_search_set(null);
        }

        $headers = $storage->list_messages($folder, $page, $sort, $order);
        $total = $storage->count($folder, 'ALL', false);

        return [
            'folder' => $folder,
            'page' => $page,
            'per_page' => $per_page,
            'pages' => max(1, (int) ceil($total / $per_page)),
            'total' => (int) $total,
            'messages' => array_map(fn ($h) => $this->summary($h, $folder), array_values($headers)),
        ];
    }

    // ---- single message -------------------------------------------------

    public function message(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', null, true);
        $uid = $this->api->int('uid');
        $remote = (bool) $this->api->int('images', 0);

        $msg = new rcube_message($uid, $folder, $remote);

        if (empty($msg->headers)) {
            throw new rcmail_api_exception(404, 'message_not_found', 'Unknown message');
        }

        $h = $msg->headers;
        $was_unseen = empty($h->flags['SEEN']);

        $marked = $was_unseen && !$this->api->int('peek', 0);

        if ($marked) {
            $storage->set_flag($uid, 'SEEN', $folder);
        }

        // body
        $html = null;
        $text = null;
        $blocked = false;

        if ($msg->has_html_part()) {
            $part = null;
            $body = $msg->first_html_part($part, true);
            $html = $this->wash($body, $this->cid_map($msg, $folder), $remote, $blocked);
        }

        if ($msg->has_text_part() || $html === null) {
            $part = null;
            $body = $msg->first_text_part($part);
            $text = is_string($body) ? $body : '';

            if ($html === null) {
                $flowed = $part && ($part->ctype_parameters['format'] ?? '') === 'flowed';
                $delsp = $part && ($part->ctype_parameters['delsp'] ?? '') === 'yes';
                $html = '<html><body>' . rcmail_action_mail_index::plain_body($text, $flowed, $delsp) . '</body></html>';
            }
        } elseif ($html !== null) {
            $text = (new rcube_html2text($body, false, true, 0))->get_text();
        }

        $attachments = [];
        foreach ($msg->attachments as $part) {
            // images embedded in the HTML (cid:) are part of the body, not attachments
            if (!empty($part->content_id) && $html !== null && stripos($html, trim($part->content_id, '<>')) !== false) {
                continue;
            }

            $attachments[] = [
                'part' => $part->mime_id,
                'name' => $part->filename ?: ('attachment-' . $part->mime_id),
                'type' => $part->mimetype,
                'size' => (int) $part->size,
                'image' => in_array(strtolower($part->mimetype), self::INLINE_IMAGES, true),
            ];
        }

        // 'seen' is the state after this request, 'seen_before' the one the list showed
        return array_merge($this->summary($h, $folder), ['seen' => !$was_unseen || $marked]) + [
            'seen_before' => !$was_unseen,
            'cc' => $this->addresses($h->cc, $h->charset),
            'bcc' => $this->addresses($h->bcc ?? '', $h->charset),
            'reply_to' => $this->addresses($h->replyto ?? '', $h->charset),
            'message_id' => $h->messageID,
            'in_reply_to' => $h->in_reply_to,
            'references' => $h->references ?? '',
            'unsubscribe' => $msg->get_header('List-Unsubscribe') ?: null,
            'html' => $html,
            'text' => mb_substr((string) $text, 0, 200000),
            'remote_blocked' => $blocked,
            'attachments' => $attachments,
        ];
    }

    /**
     * Stream an attachment or inline part. Plain GET link: needs the `_token` query parameter.
     */
    public function part(): ?array
    {
        $this->api->storage();
        $folder = $this->api->string('folder', null, true);
        $uid = $this->api->int('uid');
        $id = $this->api->string('part', null, true);

        $msg = new rcube_message($uid, $folder);
        $part = $msg->mime_parts[$id] ?? null;

        if (empty($msg->headers) || !$part) {
            throw new rcmail_api_exception(404, 'part_not_found', 'Unknown attachment');
        }

        $type = strtolower($part->mimetype ?: 'application/octet-stream');
        $inline = $this->api->int('inline', 0) && in_array($type, self::INLINE_IMAGES, true);
        $name = $part->filename ?: ('part-' . $id);

        header('Content-Type: ' . ($inline ? $type : (in_array($type, self::INLINE_IMAGES, true) ? $type : 'application/octet-stream')));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($name) . '; filename="' . preg_replace('/[^\x20-\x7e]|["\\\]/', '_', $name) . '"');
        header("Content-Security-Policy: sandbox; default-src 'none'");
        header('Cache-Control: private, max-age=3600');

        $msg->get_part_content($id, fopen('php://output', 'w'), true);

        return null;
    }

    // ---- actions --------------------------------------------------------

    public function actions(): array
    {
        $storage = $this->api->storage();
        $folder = $this->api->string('folder', null, true);
        $action = $this->api->string('action', null, true);
        $uids = $this->api->input('uids') === '*' ? '*' : array_values(array_filter(array_map('intval', $this->api->list('uids'))));
        $target = $this->api->string('target');
        $special = $storage->get_special_folders();

        if (!$uids) {
            throw new rcmail_api_exception(400, 'missing_parameter', 'No messages selected');
        }

        $flags = ['mark_read' => 'SEEN', 'mark_unread' => 'UNSEEN', 'flag' => 'FLAGGED', 'unflag' => 'UNFLAGGED'];

        if (isset($flags[$action])) {
            $ok = $storage->set_flag($uids, $flags[$action], $folder);
        } elseif ($action === 'move' || $action === 'copy') {
            if (!$target || !$storage->folder_exists($target)) {
                throw new rcmail_api_exception(400, 'folder_not_found', 'Unknown target folder');
            }
            $ok = $action === 'move' ? $storage->move_message($uids, $target, $folder) : $storage->copy_message($uids, $target, $folder);
        } elseif ($action === 'delete') {
            $trash = $special['trash'] ?? null;
            $ok = $trash && $folder !== $trash && $storage->folder_exists($trash)
                ? $storage->move_message($uids, $trash, $folder)
                : $storage->delete_message($uids, $folder);
        } elseif ($action === 'archive') {
            $archive = $this->rc->config->get('archive_mbox') ?: 'Archive';
            $ok = ($storage->folder_exists($archive) || $storage->create_folder($archive, true))
                && $storage->move_message($uids, $archive, $folder);
        } elseif ($action === 'spam') {
            $junk = $special['junk'] ?? null;
            if (!$junk || !$storage->folder_exists($junk)) {
                throw new rcmail_api_exception(409, 'folder_not_found', 'There is no spam folder');
            }
            $ok = $storage->move_message($uids, $junk, $folder);
        } else {
            throw new rcmail_api_exception(400, 'invalid_parameter', 'Unknown action');
        }

        if (!$ok) {
            throw new rcmail_api_exception(502, 'storage_error', 'The mail server refused the action');
        }

        return ['ok' => true];
    }

    // ---- sending --------------------------------------------------------

    /**
     * Send a message or save a draft. multipart/form-data: JSON in "payload", files in "attachments[]".
     */
    public function send(): array
    {
        $storage = $this->api->storage();
        $rc = $this->rc;
        $draft = (bool) $this->api->input('draft', false);

        $identity = $rc->user->get_identity((int) $this->api->input('identity_id', 0)) ?: $rc->user->get_identity();
        if (!$identity || empty($identity['email'])) {
            throw new rcmail_api_exception(400, 'no_identity', 'No sender identity is configured');
        }

        $to = $this->recipients($this->api->list('to'));
        $cc = $this->recipients($this->api->list('cc'));
        $bcc = $this->recipients($this->api->list('bcc'));

        if (!$draft && !$to && !$cc && !$bcc) {
            throw new rcmail_api_exception(400, 'no_recipient', 'Add at least one recipient');
        }

        $from = format_email_recipient($identity['email'], $identity['name']);
        $subject = trim((string) $this->api->string('subject', ''));
        $html = (string) $this->api->input('html', '');
        $text = (string) $this->api->input('text', '');

        $mime = new \Mail_mime([
            'text_encoding' => 'quoted-printable', 'html_encoding' => 'quoted-printable', 'head_encoding' => 'quoted-printable',
            'head_charset' => 'UTF-8', 'html_charset' => 'UTF-8', 'text_charset' => 'UTF-8', 'eol' => "\r\n",
        ]);

        $headers = array_filter([
            'From' => $from,
            'To' => implode(', ', $to) ?: null,
            'Cc' => implode(', ', $cc) ?: null,
            'Bcc' => implode(', ', $bcc) ?: null,
            'Reply-To' => $identity['reply-to'] ?: null,
            'Subject' => $subject,
            'Date' => date('r'),
            'Message-ID' => $rc->gen_message_id($identity['email']),
            'User-Agent' => 'Glennski Webmail',
            'MIME-Version' => '1.0',
            'In-Reply-To' => $this->api->string('in_reply_to'),
            'References' => $this->api->string('references'),
            'Disposition-Notification-To' => $this->api->input('request_receipt') ? $identity['email'] : null,
        ], static fn ($v) => $v !== null && $v !== '');

        if ($html !== '') {
            $washer = new rcube_washtml(['allow_remote' => true, 'html_elements' => ['body'], 'show_washed' => false]);
            $clean = $washer->wash('<html><head><meta charset="UTF-8"></head><body>' . $html . '</body></html>');
            $mime->setHTMLBody($clean);
            $mime->setTXTBody($text !== '' ? $text : (new rcube_html2text($clean, false, true, 0))->get_text());
        } else {
            $mime->setTXTBody($text);
        }

        $this->attach_uploads($mime);
        $this->attach_forwarded($mime);

        $mime->headers($headers);

        if ($draft) {
            return $this->save_draft($storage, $mime);
        }

        $error = null;
        $body_file = null;
        $sent = $rc->deliver_message($mime, $identity['email'], implode(', ', $to) ?: implode(', ', $cc) ?: implode(', ', $bcc), $error, $body_file);

        if (!$sent) {
            $message = is_string($error) && $error !== '' ? $error : ($error['label'] ?? 'Sending failed');
            throw new rcmail_api_exception(502, 'send_failed', $message);
        }

        $this->save_sent($storage, $mime);

        // flags on the original, remove the draft this was written from
        if (($reply = $this->api->input('reply_to_message')) && is_array($reply)) {
            $storage->set_flag((int) $reply['uid'], 'ANSWERED', (string) $reply['folder']);
        }
        if (($fwd = $this->api->input('forward_of')) && is_array($fwd)) {
            $storage->set_flag((int) $fwd['uid'], 'FORWARDED', (string) $fwd['folder']);
        }
        $this->delete_old_draft($storage);

        return ['ok' => true, 'message_id' => $headers['Message-ID']];
    }

    // ---- helpers --------------------------------------------------------

    protected function status(rcube_storage $storage, string $folder): array
    {
        // force: the folder counts are cached in the session otherwise, the client polls these
        return ['unseen' => (int) $storage->count($folder, 'UNSEEN', true), 'total' => (int) $storage->count($folder, 'ALL', true)];
    }

    protected function is_special(rcube_storage $storage, string $folder): bool
    {
        return strtoupper($folder) === 'INBOX' || in_array($folder, array_filter($storage->get_special_folders()), true);
    }

    /**
     * @return array<int, array{name: string, email: string}>
     */
    protected function addresses(?string $raw, ?string $charset = null): array
    {
        $out = [];

        foreach (rcube_mime::decode_address_list((string) $raw, null, true, $charset) as $a) {
            if (!empty($a['mailto'])) {
                $out[] = ['name' => (string) ($a['name'] ?? ''), 'email' => $a['mailto']];
            }
        }

        return $out;
    }

    protected function summary(rcube_message_header $h, string $folder): array
    {
        $date = $h->date ? rcube_utils::anytodatetime($h->date) : null;
        $date = $date ?: ($h->internaldate ? rcube_utils::anytodatetime($h->internaldate) : null);
        $flags = $h->flags ?? [];

        return [
            'uid' => (int) $h->uid,
            'folder' => $folder,
            'subject' => (string) rcube_mime::decode_header((string) $h->subject, $h->charset),
            'from' => $this->addresses($h->from, $h->charset)[0] ?? ['name' => '', 'email' => ''],
            'to' => $this->addresses($h->to, $h->charset),
            'date' => $date ? $date->format(\DATE_ATOM) : null,
            'size' => (int) $h->size,
            'seen' => !empty($flags['SEEN']),
            'flagged' => !empty($flags['FLAGGED']),
            'answered' => !empty($flags['ANSWERED']),
            'forwarded' => !empty($flags['FORWARDED']),
            'draft' => !empty($flags['DRAFT']),
            'has_attachments' => (bool) preg_match('/^(application\/|multipart\/(m|signed|report))/i', (string) $h->ctype),
        ];
    }

    /**
     * cid: references of inline images -> URL of the part endpoint.
     */
    protected function cid_map(rcube_message $msg, string $folder): array
    {
        $map = [];

        foreach ($msg->mime_parts as $part) {
            if (!empty($part->content_id) && in_array(strtolower($part->mimetype), self::INLINE_IMAGES, true)) {
                // absolute path: the message is shown in a frame whose base URL differs from the page
                $map['cid:' . trim($part->content_id, '<>')] = $_SERVER['SCRIPT_NAME'] . '/v1/part?' . http_build_query([
                    'folder' => $folder, 'uid' => $msg->uid, 'part' => $part->mime_id, 'inline' => 1, '_token' => $this->rc->get_request_token(),
                ]);
            }
        }

        return $map;
    }

    /**
     * Sanitize message HTML: no scripts, forms or active content; remote content only when asked for.
     */
    protected function wash(string $html, array $cid_map, bool $remote, bool &$blocked): string
    {
        $meta = '<meta charset="' . RCUBE_CHARSET . '" />';
        $html = preg_replace('/<meta[^>]+charset=[a-z0-9_"-]+[^>]*>/Ui', '', $html);
        $html = preg_replace('/(<head[^>]*>)/Ui', '\1' . $meta, $html, -1, $count);

        if (!$count) {
            $html = '<html><head>' . $meta . '</head>' . (stripos($html, '<html') === false ? $html : preg_replace('/<html[^>]*>/i', '', $html, 1));
        }

        $washer = new rcube_washtml([
            'show_washed' => false,
            'add_comments' => false,
            'allow_remote' => $remote,
            'blocked_src' => self::BLOCKED_IMAGE,
            'cid_map' => $cid_map,
            'html_elements' => ['html', 'head', 'title', 'body', 'link'],
            // nothing in a message should collect input (<form> itself is dropped by the washer, its text stays)
            'ignore_elements' => ['input', 'button', 'select', 'textarea', 'option', 'optgroup', 'datalist'],
        ]);

        $clean = $washer->wash($html);
        $blocked = !$remote && !empty($washer->extlinks);

        return $clean;
    }

    /**
     * Parse recipient strings; only valid addresses are accepted.
     *
     * @return string[] RFC 5322 address strings
     */
    protected function recipients(array $input): array
    {
        $out = [];

        foreach ($input as $entry) {
            $entry = is_array($entry) ? format_email_recipient((string) ($entry['email'] ?? ''), (string) ($entry['name'] ?? '')) : (string) $entry;

            foreach (rcube_mime::decode_address_list($entry, null, false) as $a) {
                if (empty($a['mailto']) || !rcube_utils::check_email(rcube_utils::idn_to_ascii($a['mailto']))) {
                    throw new rcmail_api_exception(400, 'invalid_recipient', 'Invalid address: ' . ($a['mailto'] ?? $entry));
                }
                $out[] = format_email_recipient(rcube_utils::idn_to_ascii($a['mailto']), (string) ($a['name'] ?? ''));
            }
        }

        return $out;
    }

    protected function attach_uploads(\Mail_mime $mime): void
    {
        $files = $_FILES['attachments'] ?? null;

        if (!$files) {
            return;
        }

        foreach ((array) $files['name'] as $i => $name) {
            if (($files['error'][$i] ?? \UPLOAD_ERR_NO_FILE) === \UPLOAD_ERR_NO_FILE) {
                continue;
            }
            if ($files['error'][$i] !== \UPLOAD_ERR_OK || !is_uploaded_file($files['tmp_name'][$i])) {
                throw new rcmail_api_exception(400, 'upload_failed', 'An attachment could not be uploaded (too large?)');
            }

            $mime->addAttachment($files['tmp_name'][$i], $files['type'][$i] ?: 'application/octet-stream', $name, true, 'base64', 'attachment', 'UTF-8');
        }
    }

    /**
     * Attachments of a message that is being forwarded.
     */
    protected function attach_forwarded(\Mail_mime $mime): void
    {
        foreach ($this->api->list('forward_attachments') as $ref) {
            $msg = new rcube_message((int) ($ref['uid'] ?? 0), (string) ($ref['folder'] ?? ''));
            $part = $msg->mime_parts[(string) ($ref['part'] ?? '')] ?? null;

            if (empty($msg->headers) || !$part) {
                continue;
            }

            $mime->addAttachment($msg->get_part_content($part->mime_id, null, true), $part->mimetype, $part->filename ?: 'attachment', false, 'base64', 'attachment', 'UTF-8');
        }
    }

    protected function target_folder(rcube_storage $storage, string $role, string $fallback): ?string
    {
        $folder = ($storage->get_special_folders()[$role] ?? null) ?: $this->rc->config->get($role . '_mbox', $fallback);

        if ($folder && !$storage->folder_exists($folder)) {
            $storage->create_folder($folder, true);
        } elseif ($folder && !$storage->folder_exists($folder, true)) {
            $storage->subscribe($folder);
        }

        return $folder ?: null;
    }

    protected function save_sent(rcube_storage $storage, \Mail_mime $mime): void
    {
        if ($this->rc->config->get('no_save_sent_messages') || !($folder = $this->target_folder($storage, 'sent', 'Sent'))) {
            return;
        }

        if (!$storage->save_message($folder, $mime->getMessage(), '', false, ['SEEN'])) {
            rcube::raise_error(['code' => 800, 'type' => 'imap', 'message' => "Could not save message in {$folder}"], true, false);
        }
    }

    protected function save_draft(rcube_storage $storage, \Mail_mime $mime): array
    {
        $folder = $this->target_folder($storage, 'drafts', 'Drafts');
        $saved = $folder ? $storage->save_message($folder, $mime->getMessage(), '', false, ['DRAFT', 'SEEN']) : false;

        if (!$saved) {
            throw new rcmail_api_exception(502, 'storage_error', 'The draft could not be saved');
        }

        // servers without UIDPLUS do not return the UID: look the message up by its Message-ID
        $uid = is_int($saved) ? $saved : null;
        if (!$uid && ($id = $mime->headers()['Message-ID'] ?? null)) {
            $uids = $storage->search_once($folder, 'HEADER Message-ID ' . rcube_imap_generic::escape($id))->get();
            $uid = $uids ? (int) max($uids) : null;
        }

        $this->delete_old_draft($storage, $uid);

        return ['ok' => true, 'folder' => $folder, 'uid' => $uid];
    }

    /**
     * Drafts are replaced on every save and removed once the message is sent.
     */
    protected function delete_old_draft(rcube_storage $storage, $except = null): void
    {
        $old = $this->api->input('draft_uid');
        $folder = $this->target_folder($storage, 'drafts', 'Drafts');

        if ($old && $folder && (int) $old !== (int) $except) {
            $storage->delete_message([(int) $old], $folder);
        }
    }
}
