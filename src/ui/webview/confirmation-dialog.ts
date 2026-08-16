/**
 * Confirmation Dialog — renders a modal overlay for auto-placement confirmation.
 *
 * This component displays a confirmation dialog after auto-placing section markers,
 * showing how many were placed and any warnings about insufficient count.
 */
import type { InsufficientCountWarning, ConfirmationDialogData } from "../../ui/messages.js";

/**
 * Render the confirmation dialog for auto-placed section markers.
 *
 * @param data - The data to render in the dialog.
 * @returns HTML string for the confirmation dialog.
 */
export function renderConfirmationDialog(data: ConfirmationDialogData): string {
  const { markersPlaced, warning } = data;
  
  let warningHtml = "";
  if (warning !== null) {
    const { placed, typicalMin, typicalMax } = warning;
    let rangeText = "";
    
    if (typicalMin === typicalMax) {
      rangeText = `typical for this genre is ${typicalMin} sections`;
    } else {
      rangeText = `typical for this genre is ${typicalMin}\u2013${typicalMax} sections`;
    }
    
    warningHtml = `
      <div class="insufficient-warning">
        <p>${placed} sections placed \u2014 ${rangeText}</p>
      </div>
    `;
  }

  return `
    <div class="confirmation-dialog-overlay" role="dialog" aria-modal="true" aria-label="Section markers confirmation">
      <div class="confirmation-dialog">
        <h2>Section Markers Placed</h2>
        <p>The section markers were automatically placed based on the arrangement content.</p>
        <p>We recommend reviewing and adjusting marker positions to match your creative vision.</p>
        <p class="marker-count">${markersPlaced} locators placed</p>
        ${warningHtml}
        <button class="dismiss-btn" id="dismiss-confirmation-btn" type="button">Got it</button>
      </div>
    </div>
    <script>
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          const btn = document.getElementById('dismiss-confirmation-btn');
          if (btn) {
            btn.click();
          }
        }
      });
    </script>
  `;
}