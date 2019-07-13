export class BranchData {
  name: string;
  path: string;
  pageType: string;
  updatedAt: string;
  children: BranchData[];
  isEnabled: boolean;
}
