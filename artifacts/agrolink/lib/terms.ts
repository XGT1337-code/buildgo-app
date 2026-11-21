import type { IconName } from '@/components/ui';
import type { Listing, RentalTerms } from './types';
import { t } from './i18n';

export type TermsKind = 'rental' | 'equipment' | 'materials';

export interface TermsSection { id: string; title: string; icon: IconName; points: string[] }
export interface TermsDoc { kind: TermsKind; tab: string; title: string; lede: string; sections: TermsSection[] }

export const TERMS_DISCLAIMER =
  'These are plain-language templates to help both sides agree on the same things up front. They are not legal advice and not a contract enforced by BuildGO. BuildGO does not hold money, run escrow, insure equipment or settle disputes. Write down what you agree and keep receipts.';

export const TERMS: Record<TermsKind, TermsDoc> = {
  rental: {
    kind: 'rental', tab: 'Rental', title: 'Equipment rental',
    lede: 'For renting an excavator, truck, crane, concrete mixer or tools for hours or days. The owner sets specifics on each listing; this is the baseline.',
    sections: [
      { id: 'pay', title: 'Payment', icon: 'credit-card', points: [
        'Agree the daily price, the number of days and the total before the machine leaves the yard.',
        'Pay directly to the owner: cash at handover, bank transfer, or half upfront and half on return. BuildGO does not process payments.',
        'Ask for a written or messaged receipt for every payment.',
      ] },
      { id: 'dep', title: 'Deposit', icon: 'shield', points: [
        'An optional deposit may be agreed. State the amount and what it covers (damage, late return, missing attachments).',
        'Return the deposit at check-in, minus only documented costs both sides saw.',
      ] },
      { id: 'del', title: 'Delivery and handover', icon: 'truck', points: [
        'Say who moves the machine, who pays transport, and the handover time and place.',
        'Agree fuel: return full, pay for fuel used, or fuel included.',
        'Say whether an operator comes with the machine. If the renter operates, the owner may ask to see a licence.',
      ] },
      { id: 'insp', title: 'Inspection', icon: 'search', points: [
        'At handover, walk around the machine together. Photograph tyres or tracks, glass, hydraulics, attachments and the hour meter.',
        'Note existing damage in the chat so both sides have the same record.',
      ] },
      { id: 'ret', title: 'Returns and cancellation', icon: 'rotate-ccw', points: [
        'Return at the agreed time, cleaned of concrete, mortar and heavy mud.',
        'Late return: agree an hourly or daily rate in advance.',
        'Cancellation window as set on the listing, for example free until 48 hours before start.',
        'Breakdowns from normal wear are the owner’s concern; damage from misuse is the renter’s.',
      ] },
      { id: 'disp', title: 'Disputes', icon: 'message-square', points: [
        'Talk first, with the photos from handover and return.',
        'If you cannot agree, ask a respected third party such as an experienced site manager or a builders\’ association to mediate.',
        'Local law applies. For larger sums, use a written contract or a notary.',
      ] },
    ],
  },
  equipment: {
    kind: 'equipment', tab: 'Equipment sale', title: 'Selling equipment',
    lede: 'A checklist for selling a used machine or tool. BuildGO has no sales marketplace; use this when you arrange a sale yourselves.',
    sections: [
      { id: 'pay', title: 'Payment', icon: 'credit-card', points: [
        'Agree the full price and what is included: attachments, spare parts, documents.',
        'Prefer bank transfer for large sums. If cash, count it together and sign a receipt.',
        'Ownership passes when full payment is received, unless you agree otherwise in writing.',
      ] },
      { id: 'dep', title: 'Deposit', icon: 'shield', points: [
        'A small deposit can hold the machine for a fixed number of days. Say whether it is refundable.',
        'Write the hold date and the deposit amount on the receipt.',
      ] },
      { id: 'del', title: 'Delivery and documents', icon: 'truck', points: [
        'Say who collects or delivers the machine and who pays transport.',
        'Hand over registration documents, service history and keys at the same time as the machine.',
        'Check the serial and engine numbers match the documents.',
      ] },
      { id: 'insp', title: 'Inspection', icon: 'search', points: [
        'Buyer may inspect and test-run before paying in full. Bring a mechanic if you can.',
        'Seller should disclose known faults, accident history and hours.',
      ] },
      { id: 'ret', title: 'Returns', icon: 'rotate-ccw', points: [
        'Used equipment is usually sold as seen. If you offer a return window, write the number of days and conditions.',
        'Any warranty from the seller must be written down, with what it covers.',
      ] },
      { id: 'disp', title: 'Disputes', icon: 'message-square', points: [
        'Keep the receipt, photos and messages.',
        'Try a neutral mediator first. Re-registration and ownership disputes follow local law.',
      ] },
    ],
  },
  materials: {
    kind: 'materials', tab: 'Materials sale', title: 'Selling materials',
    lede: 'For selling sand, crushed stone, rebar, bricks or leftovers from a job. Template only; BuildGO does not run a materials marketplace.',
    sections: [
      { id: 'pay', title: 'Payment', icon: 'credit-card', points: [
        'Agree the price per tonne, cubic metre or piece, and how the amount is measured.',
        'Common options: cash on loading, transfer before loading, or a deposit with the balance on delivery.',
        'For repeat buyers, agree the payment deadline in days.',
      ] },
      { id: 'dep', title: 'Deposit and advance', icon: 'shield', points: [
        'An advance can reserve a batch. Write how much, by when it is delivered, and what happens if there is less than agreed.',
      ] },
      { id: 'del', title: 'Delivery and weighing', icon: 'truck', points: [
        'Say pickup from the yard or delivery to the site, and who pays transport and unloading.',
        'Agree how the amount is checked: a certified weighbridge, the truck body volume or a piece count, and keep the delivery note.',
      ] },
      { id: 'insp', title: 'Quality and inspection', icon: 'search', points: [
        'Agree the grade before loading: concrete class, stone fraction, rebar diameter and steel grade, brick grade.',
        'Buyer may check the load on arrival. For concrete, ask for the batch ticket and take test cubes on big pours.',
      ] },
      { id: 'ret', title: 'Rejections and returns', icon: 'rotate-ccw', points: [
        'If quality is below the agreed grade, the buyer says so at delivery, not days later.',
        'Agree in advance whether a price cut or return applies, and who pays transport back.',
        'Concrete and mortar cannot wait: agree the time within which a complaint must be raised.',
      ] },
      { id: 'disp', title: 'Disputes', icon: 'message-square', points: [
        'Use the delivery note or weigh ticket, samples and photos.',
        'Ask the supplier or a builders\’ association to mediate before going further.',
      ] },
    ],
  },
};

export const PAYMENT_OPTS = ['Cash at handover', 'Bank transfer before start', 'Half upfront, half on return'];
export const DELIVERY_OPTS = ['Renter collects', 'Owner delivers, fee agreed', 'Owner delivers free within 10 km'];
export const FUEL_OPTS = ['Return with full tank', 'Renter pays fuel used', 'Fuel included in price'];
export const OPERATOR_OPTS = ['Operator included', 'Renter operates, licence shown', 'Either, agree in chat'];
export const CANCEL_OPTS = ['Free until 48 h before start', 'Free until 24 h before start', 'No free cancellation'];

export const DEFAULT_RENTAL_TERMS: RentalTerms = {
  payment: PAYMENT_OPTS[0], deposit: 0, delivery: DELIVERY_OPTS[0], fuel: FUEL_OPTS[0],
  operator: OPERATOR_OPTS[2], cancellation: CANCEL_OPTS[0], extra: '',
};

/** Rows in the interface language. Preset options are translated; the owner's own notes are shown as typed. */
export function termsRows(x: RentalTerms): [string, string][] {
  const rows: [string, string][] = [
    [t('Payment'), t(x.payment)],
    [t('Deposit'), x.deposit > 0 ? t('{n} AZN, returned at check-in minus documented damage', { n: x.deposit }) : t('No deposit')],
    [t('Delivery'), t(x.delivery)],
    [t('Fuel'), t(x.fuel)],
    [t('Operator'), t(x.operator)],
    [t('Cancellation'), t(x.cancellation)],
    [t('Inspection'), t('Joint walk-around with photos at handover and return')],
    [t('Disputes'), t('Talk first, then a neutral local mediator. Local law applies')],
  ];
  if (x.extra.trim()) rows.push([t('Owner notes'), x.extra.trim()]);
  return rows;
}

export function listingTerms(l: Listing): { terms: RentalTerms; source: 'owner' | 'template' } {
  return l.terms ? { terms: l.terms, source: 'owner' } : { terms: DEFAULT_RENTAL_TERMS, source: 'template' };
}

export function termsText(l: Listing): string {
  const { terms, source } = listingTerms(l);
  const head = `${l.title} · ${l.pricePerDay} AZN/${t('day')} · ${source === 'owner' ? t('conditions set by owner') : t('BuildGO default template')}`;
  return [head, ...termsRows(terms).map(([k, v]) => `${k}: ${v}`), t('Template, not legal advice. BuildGO does not handle payments or escrow.')].join('\n');
}
