import QRCode from "qrcode";

// Server-only: generates the QR as an SVG string, no canvas/DOM needed —
// safe to call directly from an async Server Component and inject via
// dangerouslySetInnerHTML. The encoded string is always a server-generated
// booking_reference (format GB-XXXXXX, restricted alphabet — see
// generate_booking_reference() in the core migration), never user input,
// so there's no injection risk in trusting this output.
export async function generateTicketQrSvg(bookingReference: string): Promise<string> {
  return QRCode.toString(bookingReference, { type: "svg", margin: 1, width: 160 });
}
