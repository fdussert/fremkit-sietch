# Messages 2FA

This widget checks incoming Messages from the last five minutes only after a person taps its
button. It recognizes a code only when nearby text identifies it as a verification, security,
authentication, passcode, sign-in, or French verification code. The code is copied to the clipboard
without being returned to the widget or displayed. A “Copied” confirmation clears after 30 seconds.
Fremkit schedules a best-effort cleanup after one minute. It clears the clipboard only if its
contents have not changed; if macOS refuses cleanup, the code may remain until replaced.

The helper reads the Messages database in read-only mode. Message text and codes are held only in
memory for the request; there is no polling, history, logging, or network request. The widget asks
only for the local `messages-2fa` command.

macOS may require Full Disk Access for Fremkit Helper to read Messages. Full Disk Access is a
broad permission that reaches beyond Messages; it is not enabled or requested by this widget. If
access is unavailable, the widget reports that it could not read Messages and does not copy or
show any value. The read also fails closed if the local database format is unsupported.
