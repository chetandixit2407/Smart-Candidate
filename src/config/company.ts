/**
 * Centralized Company Configuration for White Collar Realty
 *
 * Official address and corporate details are defined here to ensure
 * global consistency across branding, dashboards, candidate portals,
 * offer letters, relieving letters, and document exports.
 */

export interface CompanyConfig {
  name: string;
  legalName: string;
  tagline: string;
  shortName: string;
  officialAddress: string;
  building: string;
  floor: string;
  tower: string;
  park: string;
  sector: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  corporateEmail: string;
  hrEmail: string;
  corporatePhone: string;
  hrPhone: string;
  website: string;
  dubaiBranchAddress: string;
  dubaiCity: string;
  dubaiCountry: string;
}

export const COMPANY_CONFIG: CompanyConfig = {
  name: 'White Collar Realty',
  legalName: 'White Collar Realty Private Limited',
  tagline: 'HR & Candidate Management System',
  shortName: 'WCR',
  officialAddress: '6th Floor, Tower A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101, India.',
  building: 'M3M Urbana Business Park',
  floor: '6th Floor',
  tower: 'Tower A',
  park: 'M3M Urbana Business Park',
  sector: 'Sector 67',
  city: 'Gurugram',
  state: 'Haryana',
  pincode: '122101',
  country: 'India',
  corporateEmail: 'contact@whitecollarrealty.com',
  hrEmail: 'hr@whitecollarrealty.com',
  corporatePhone: '+91 124-4349007',
  hrPhone: '+91 124-4349007',
  website: 'https://whitecollarrealty.com',
  dubaiBranchAddress: 'White Collar Realty DIFC Branch, Gate Precinct 4, Dubai, UAE',
  dubaiCity: 'Dubai',
  dubaiCountry: 'UAE',
};

export function getWorkLocationForMarket(market?: string): string {
  if (market === 'Dubai') {
    return COMPANY_CONFIG.dubaiBranchAddress;
  }
  return COMPANY_CONFIG.officialAddress;
}

export function getJurisdictionPlaceForMarket(market?: string): string {
  if (market === 'Dubai') {
    return `${COMPANY_CONFIG.dubaiCity}, ${COMPANY_CONFIG.dubaiCountry}`;
  }
  return `${COMPANY_CONFIG.city}, ${COMPANY_CONFIG.state}`;
}
