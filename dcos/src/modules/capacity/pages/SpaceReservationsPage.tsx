import SpaceCapacityPage from './SpaceCapacityPage';
import ReservationLedgerPage from './ReservationLedgerPage';

/** Space and the reservations held against it, in one view. */
export default function SpaceReservationsPage() {
  return (
    <div>
      <SpaceCapacityPage embedded />
      <div style={{ height: 28 }} />
      <ReservationLedgerPage />
    </div>
  );
}
