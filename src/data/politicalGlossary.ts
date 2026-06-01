export interface PoliticalGlossaryTerm {
  term: string;
  aliases?: string[];
  category: string;
  plainDefinition: string;
  whyItMatters: string;
  example: string;
}

export const politicalGlossaryTerms: PoliticalGlossaryTerm[] = [
  {
    term: 'Filibuster',
    aliases: ['filibusters', 'filibustering'],
    category: 'Congress',
    plainDefinition: 'A Senate tactic that delays or blocks a vote by extending debate unless enough senators agree to move forward.',
    whyItMatters: 'It can make a bill need 60 Senate votes instead of a simple majority, so it often decides whether major legislation can pass.',
    example: 'If 41 senators oppose ending debate, they can often keep a bill from getting a final vote.',
  },
  {
    term: 'Cloture',
    category: 'Congress',
    plainDefinition: 'The formal Senate vote to end debate on a bill, nomination, or motion.',
    whyItMatters: 'Cloture is the main way senators overcome a filibuster and force the Senate to move toward a vote.',
    example: 'When you hear that cloture was invoked, it usually means enough senators voted to limit debate.',
  },
  {
    term: 'Continuing resolution',
    aliases: ['CR', 'continuing resolutions'],
    category: 'Budget',
    plainDefinition: 'A temporary funding bill that keeps government agencies open when Congress has not passed a full budget.',
    whyItMatters: 'CRs prevent shutdowns but usually keep spending mostly on autopilot instead of making long-term choices.',
    example: 'Congress may pass a 45-day continuing resolution to keep agencies funded while negotiations continue.',
  },
  {
    term: 'Reconciliation',
    aliases: ['budget reconciliation'],
    category: 'Budget',
    plainDefinition: 'A special budget process that lets certain tax, spending, and debt-limit bills pass the Senate with a simple majority.',
    whyItMatters: 'It can bypass the filibuster, but only for policies that fit strict budget rules.',
    example: 'A party with narrow Senate control may use reconciliation for a tax or health-care spending package.',
  },
  {
    term: 'Appropriations',
    aliases: ['appropriation', 'appropriations bill'],
    category: 'Budget',
    plainDefinition: 'The process Congress uses to approve money for specific government agencies and programs.',
    whyItMatters: 'Authorizing a program says it may exist; appropriations decide whether and how much money it receives.',
    example: 'A disaster-response program may be authorized, but it still needs appropriated funds to operate.',
  },
  {
    term: 'Authorization',
    aliases: ['authorizing', 'authorization bill'],
    category: 'Congress',
    plainDefinition: 'A law that creates or renews a government program and sets what it is allowed to do.',
    whyItMatters: 'Authorization gives legal permission, but Congress often must separately appropriate money.',
    example: 'An education program can be authorized for five years before annual funding bills decide its budget.',
  },
  {
    term: 'Amendment',
    aliases: ['amendments'],
    category: 'Congress',
    plainDefinition: 'A proposed change to a bill or to the Constitution.',
    whyItMatters: 'Amendments can significantly change what a bill does before lawmakers vote on final passage.',
    example: 'A senator might offer an amendment adding rural hospital funding to a health-care bill.',
  },
  {
    term: 'Motion to recommit',
    aliases: ['MTR'],
    category: 'Congress',
    plainDefinition: 'A House procedure that sends a bill back to committee, often with instructions for changes.',
    whyItMatters: 'It is commonly used as a final attempt to alter, delay, or highlight objections to a bill before passage.',
    example: 'The minority party may use a motion to recommit to force a vote on a politically sensitive change.',
  },
  {
    term: 'Discharge petition',
    category: 'Congress',
    plainDefinition: 'A House tool that can force a bill out of committee if enough representatives sign it.',
    whyItMatters: 'It lets a majority bypass committee leadership when leaders do not want a bill to receive a floor vote.',
    example: 'If 218 House members sign a discharge petition, the bill can move toward consideration by the full House.',
  },
  {
    term: 'Incumbent',
    aliases: ['incumbency'],
    category: 'Elections',
    plainDefinition: 'The person currently holding an elected office.',
    whyItMatters: 'Incumbents often have advantages like name recognition, fundraising networks, and an official record to run on.',
    example: 'A challenger is running against the incumbent senator who already holds the seat.',
  },
  {
    term: 'Primary',
    aliases: ['primary election', 'primaries'],
    category: 'Elections',
    plainDefinition: 'An election where voters choose a party’s candidate for the general election.',
    whyItMatters: 'Primaries shape the choices voters see in November and can push candidates toward party-base priorities.',
    example: 'A Democrat and a Republican each win their primaries, then face each other in the general election.',
  },
  {
    term: 'Gerrymandering',
    aliases: ['gerrymander', 'gerrymandered'],
    category: 'Elections',
    plainDefinition: 'Drawing voting district lines to give one party or group an advantage.',
    whyItMatters: 'District boundaries can affect how competitive elections are and how fairly votes translate into seats.',
    example: 'A map may split one group of voters across several districts to weaken their influence.',
  },
  {
    term: 'Super PAC',
    aliases: ['super PACs', 'independent expenditure-only committee'],
    category: 'Campaign finance',
    plainDefinition: 'A political committee that can raise and spend unlimited money independently to support or oppose candidates.',
    whyItMatters: 'Super PACs can heavily influence races, but they are not supposed to coordinate spending with campaigns.',
    example: 'A super PAC may buy ads supporting a candidate, as long as it acts independently from that campaign.',
  },
  {
    term: 'Dark money',
    category: 'Campaign finance',
    plainDefinition: 'Political spending where the original donors are not fully disclosed to the public.',
    whyItMatters: 'It can make it hard for voters to know who is trying to influence an election or policy debate.',
    example: 'A nonprofit may fund issue ads without revealing all of the donors behind the spending.',
  },
  {
    term: 'Independent expenditure',
    aliases: ['independent expenditures', 'IE'],
    category: 'Campaign finance',
    plainDefinition: 'Spending for ads or communications that support or oppose a candidate without coordinating with that candidate’s campaign.',
    whyItMatters: 'It is a major way outside groups influence elections while remaining legally separate from campaigns.',
    example: 'A committee buys mailers attacking a candidate and reports the cost as an independent expenditure.',
  },
  {
    term: 'Earmark',
    aliases: ['earmarks'],
    category: 'Budget',
    plainDefinition: 'Money in a spending bill directed to a specific local project or recipient.',
    whyItMatters: 'Supporters call earmarks targeted local funding; critics may call them political favors or pork-barrel spending.',
    example: 'A transportation bill might include an earmark for a bridge repair in one district.',
  },
];
