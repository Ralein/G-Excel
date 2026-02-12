/**
 * Field name synonym dictionary for smart matching.
 * Each key is a canonical name, values are common variations.
 */
const SYNONYMS = {
    email: ['mail', 'e-mail', 'contact_email', 'email_address', 'user_email', 'emailaddress', 'e_mail'],
    phone: ['mobile', 'tel', 'telephone', 'contact_no', 'phone_number', 'cell', 'phonenumber', 'mobile_no', 'contact_number', 'cellular'],
    name: ['fullname', 'full_name', 'username', 'user_name', 'candidate', 'person', 'applicant', 'contactname', 'contact_name'],
    first_name: ['fname', 'given_name', 'forename', 'firstname', 'first', 'givenname'],
    last_name: ['lname', 'surname', 'family_name', 'lastname', 'last', 'familyname'],
    address: ['street', 'location', 'addr', 'address_line', 'street_address', 'addressline1', 'address1', 'address_line_1'],
    address2: ['address_line_2', 'addressline2', 'apt', 'suite', 'unit', 'apartment'],
    city: ['town', 'municipality', 'locality', 'cityname'],
    state: ['province', 'region', 'state_province', 'stateprovince'],
    zipcode: ['zip', 'postal_code', 'postcode', 'zip_code', 'postalcode', 'pincode', 'pin_code'],
    country: ['nation', 'country_code', 'countrycode', 'country_name'],
    company: ['organization', 'employer', 'firm', 'business', 'org', 'organisation', 'company_name', 'companyname'],
    title: ['job_title', 'jobtitle', 'position', 'designation', 'role'],
    date: ['dob', 'birth_date', 'date_of_birth', 'birthdate', 'dateofbirth'],
    website: ['url', 'web', 'homepage', 'site', 'webpage', 'web_url'],
    comments: ['notes', 'remarks', 'description', 'message', 'comment', 'feedback', 'bio', 'about'],
    gender: ['sex', 'male_female'],
    age: ['years', 'years_old'],
    salary: ['compensation', 'pay', 'income', 'wage'],
    department: ['dept', 'division', 'unit', 'section'],
    id: ['employee_id', 'emp_id', 'staff_id', 'identifier', 'record_id']
};

/**
 * Lookup canonical name for a given term.
 * @param {string} term - The term to look up
 * @returns {string|null} The canonical name, or null if not found
 */
function findCanonical(term) {
    if (!term) return null;
    const normalized = term.toLowerCase().replace(/[\s\-]+/g, '_').trim();

    // Direct match on canonical key
    if (SYNONYMS[normalized]) return normalized;

    // Search through synonym lists
    for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
        if (synonyms.includes(normalized)) return canonical;
    }

    return null;
}

/**
 * Check if two terms are synonymous.
 * @param {string} termA
 * @param {string} termB
 * @returns {boolean}
 */
function areSynonyms(termA, termB) {
    if (!termA || !termB) return false;
    const canonA = findCanonical(termA);
    const canonB = findCanonical(termB);

    if (canonA && canonB && canonA === canonB) return true;

    // Also check direct match after normalization
    const normA = termA.toLowerCase().replace(/[\s\-]+/g, '_').trim();
    const normB = termB.toLowerCase().replace(/[\s\-]+/g, '_').trim();
    return normA === normB;
}

/**
 * Get all known synonyms for a term (including the canonical name).
 * @param {string} term
 * @returns {string[]}
 */
function getSynonyms(term) {
    const canonical = findCanonical(term);
    if (!canonical) return [];
    return [canonical, ...SYNONYMS[canonical]];
}
