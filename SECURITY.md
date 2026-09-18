# Security

A widget here runs in the user's Fremkit inside a sandboxed iframe, with the permissions its
manifest declares and the user accepted. The sandbox, the bridge and the install path belong
to the main repository; its [SECURITY.md](https://github.com/fdussert/fremkit/blob/main/SECURITY.md)
describes the threat model and how to report a problem in them.

For a problem in a widget published here — data sent where it should not go, an unescaped
remote string, a permission that is wider than what the widget does — use GitHub's private
vulnerability reporting on this repository. A confirmed report gets the widget pulled from the
index first and fixed second.
