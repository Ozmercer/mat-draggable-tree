import {Component, OnInit, ViewChild} from '@angular/core';
import {BranchData} from "./models/BranchData";
import {MatTableDataSource, MatTree, MatTreeNestedDataSource} from "@angular/material";
import {SelectionModel} from "@angular/cdk/collections";
import {PageType} from "./models/PageType";
import {NestedTreeControl} from "@angular/cdk/tree";

interface IPagesAndData {
  pages: BranchData[];
  dataSource: MatTableDataSource<BranchData>;
  selection: SelectionModel<BranchData>;
}

interface PageData {
  name: string;
  path: string;
  pageType: string;
  language: string;
  vertical: string;
  semanticTags: string[];
  updatedAt: string;
  children: PageData[];
  isEnabled: boolean;
}

interface EditedBranchData {
  pageName: string;
  path: string;
  parentId: string;
  isCustomPath: boolean;
  _id: string;
}

enum filterButtons {
  'all',
  'published',
  'trashed'
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('tree') tree: MatTree<BranchData>;

  displayedColumns: string[];
  editable: boolean;
  project: string;
  mapKeysArray: PageType[];
  pagesMap: Map<PageType, IPagesAndData>;
  searchTerm: string;
  bulkActionsItems: BranchData[];
  showBulkModal: boolean;
  modalState: string;
  isMenuOpen: boolean;
  selectedLabels: string[];

  /** Tree configs */
  draggedRow: BranchData;
  targetRow: BranchData;
  filteredRows: BranchData[];
  disabledRowsCount: number;
  activeFilterButton: string;
  isModified: boolean;
  MAX_ROWS = 999;
  maxRows: number;
  showingAllRows: boolean;
  visibleTableRows: number;
  editedBranches: Map<string, EditedBranchData>;
  savingTree: boolean;
  draggablePageTypes: PageType[];
  dropablePageTypes: PageType[];

  treeControl = new NestedTreeControl<BranchData>(node => node.children);
  treeDataSource = new MatTreeNestedDataSource<BranchData>();

  constructor() {
    this.editable = true;
    this.displayedColumns = ['select', 'pageName', 'language', 'vertical', 'labels', 'updatedAt', 'editPage'];
    this.searchTerm = '';
    this.bulkActionsItems = [];
    this.showBulkModal = false;
    this.isMenuOpen = false;
    this.selectedLabels = [];
    this.draggedRow = null;
    this.targetRow = null;
    this.filteredRows = [];
    this.disabledRowsCount = 0;
    this.activeFilterButton = 'published';
    this.isModified = false;
    this.maxRows = this.MAX_ROWS;
    this.visibleTableRows = 0;
    this.editedBranches = new Map<string, EditedBranchData>(null);
    this.savingTree = false;
    this.draggablePageTypes = [PageType.BLOG, PageType.POST];
    this.dropablePageTypes = [PageType.BLOG];
  }

  hasChild = (_: number, node: PageData) => !!node.children && node.children.length > 0;


  ngOnInit() {
    const storedFilter = localStorage.getItem('filterButton');
    this.activeFilterButton = storedFilter ? filterButtons[storedFilter] : 'published';
  }

  getNewTreeData() {
    this.filteredRows.forEach(page => page.children = []);
    const rootPages = this.filteredRows.filter(page => !page.parentId);
    let unsortedPages = this.filteredRows.filter(page => !!page.parentId);
    const sortedPages = [...rootPages];
    let deadEnd = false;

    while (unsortedPages.length && !deadEnd) {
      const originalListLength = unsortedPages.length;
      unsortedPages.forEach(page => {
        const parentIdx = sortedPages.findIndex(sortedPage => sortedPage._id === page.parentId);
        if (parentIdx > -1) {
          sortedPages[parentIdx].children.push(page);
          unsortedPages = unsortedPages.filter(remove => remove._id !== page._id);
          sortedPages.push(page);
        }
      });
      if (unsortedPages.length === originalListLength) {
        deadEnd = true;
        /** If filter hides page's root parent, add page to root */
        rootPages.push(...unsortedPages);
      }
    }
    return rootPages;
  }

  sortByPageType(a: BranchData, b: BranchData) {
    if (a.pageType > b.pageType) {
      return 1;
    }
    if (a.pageType < b.pageType) {
      return -1;
    }
    return 0;
  }

  buildBulkList() {
    this.bulkActionsItems = [];
    if (this.pageFormat === 'tree') {
      this.filteredRows.forEach(page => {
        if (page.isChecked) {
          this.bulkActionsItems.push(page);
        }
      });
    } else if (this.pageFormat === 'table') {
      this.pagesMap.forEach(pageType => {
        this.bulkActionsItems.push(...pageType.selection.selected);
      });
    }
  }

  searchOnchange(querySearch: string) {
    if (this.searchTerm !== querySearch) {
      this.searchTerm = querySearch;
    }
    this.searchTerm = this.searchTerm.toLowerCase();
    if (this.pageFormat === 'table' && this.pagesMap) {
      /** For table */
      for (const key of Array.from(this.pagesMap.keys())) {
        this.pagesMap.get(key).dataSource.filter = this.searchTerm.trim().toLowerCase();
      }
      this.countVisibleTableRows();
    }

    /** For tree */
    if (this.pageFormat === 'tree') {
      if (this.searchTerm === '') {
        return this.filterRows(0);
      }
      this.filterRows(0);
      this.filteredRows = this.selectedWebsite.pages.filter(page => {
        let match = false;
        if (page.pageName.toLowerCase().includes(this.searchTerm) ||
          page.vertical.toLowerCase().includes(this.searchTerm) ||
          page.language.toString().toLowerCase() === this.searchTerm ||
          page.path.toLowerCase().includes(this.searchTerm) ||
          PageType[page.pageType].toString().toLowerCase().includes(this.searchTerm) ||
          this.getPageName(page).toLowerCase().includes(this.searchTerm)) {
          match = true;
        }
        return match;
      });

      this.setTreeLength();
      this.activeFilterButton = '';
      this.treeDataSource.data = this.filteredRows;
    }
  }

  /**** MAT TREE SCRIPT ****/
  addRows(reset = false) {
    this.maxRows = reset ? this.MAX_ROWS : this.maxRows += 30;
    this.filteredRows = this.selectedWebsite.pages;
    this.setTreeLength();
    if (this.searchTerm) {
      this.searchOnchange(this.searchTerm);
    } else {
      this.filterRows(filterButtons[this.activeFilterButton]);
      return;
    }
  }

  updateTree() {
    if (this.draggedRow.parentId === this.targetRow._id) {
      return;
    }
    const tempData = this.filteredRows;
    const prevParent = tempData.find(page => page._id === this.draggedRow.parentId);

    this.draggedRow.parentId = this.targetRow._id;
    this.targetRow.children.push(this.draggedRow);

    const draggedIdx = tempData.findIndex(page => page._id === this.draggedRow._id);
    const targetIdx = tempData.findIndex(page => page._id === this.targetRow._id);

    this.editPaths(this.draggedRow, this.targetRow.path);

    if (prevParent) {
      /** If not root item */
      const prevParentIdx = tempData.findIndex(page => page._id === prevParent._id);
      prevParent.children = prevParent.children.filter(child => child._id !== this.draggedRow._id);
      tempData[prevParentIdx] = prevParent;
    }
    tempData[draggedIdx] = this.draggedRow;
    tempData[targetIdx] = this.targetRow;

    this.filteredRows = tempData;
    const rootParents = this.filteredRows.filter(page => !page.parentId);
    /** tree must be nullefied before data is changed (Material Design...) */
    this.treeDataSource.data = null;
    this.treeDataSource.data = rootParents;
  }

  dragRow(row: BranchData) {
    this.targetRow = null;
    this.draggedRow = row;
  }

  releaseRow(row: BranchData) {
    if (!this.dropablePageTypes.includes(row.pageType)) {
      this.noti.userAlert('Can only drop into page of type BLOG_INDEX');
      this.draggedRow = null;
    }
    /** If is dragging and not dropped on same row that was dragged */
    if (this.draggedRow && row._id !== this.draggedRow._id && !this.checkCircularParent(row)) {
      this.targetRow = row;
      this.updateTree();
      if (this.searchTerm) {
        this.searchOnchange(this.searchTerm);
      }
    }
    this.draggedRow = null;
  }

  drop() {
    /** Timer is set so that this.drop() will occur AFTER this.releaseRow() */
    setTimeout(() => {
      if (!this.targetRow && this.draggedRow) {
        const prevParent = this.filteredRows.find(page => page._id === this.draggedRow.parentId);
        if (prevParent) {
          const prevParentIdx = this.filteredRows.findIndex(page => page._id === prevParent._id);
          prevParent.children = prevParent.children.filter(page => page._id !== this.draggedRow._id);
          this.filteredRows[prevParentIdx] = prevParent;
        }

        this.draggedRow.parentId = null;
        const draggedIdx = this.filteredRows.findIndex(page => page._id === this.draggedRow._id);
        this.filteredRows[draggedIdx] = this.draggedRow;
        const rootParents = this.filteredRows.filter(page => !page.parentId);
        this.editPaths(this.draggedRow);

        this.treeDataSource.data = null;
        this.treeDataSource.data = rootParents;
        this.draggedRow = null;
        this.targetRow = null;
        if (this.searchTerm) {
          this.searchOnchange(this.searchTerm);
        }
      }
    }, 100);
  }

  editPaths(page: BranchData, parentPath?: string) {
    if (!page.isCustomPath) {
      const originPath = page.pageType === PageType.BLOG_INDEX ?
        page.path.match(/\/[a-zA-z0-9\-_]+\/[a-zA-z0-9\-_]+\.html$/g)[0] :
        page.path.match(/\/[a-zA-z0-9\-_]*\.html$/g)[0];
      page.path = page.parentId ? parentPath.replace('.html', originPath) : originPath;
      page.children.forEach(child => {
        this.editPaths(child, page.path);
      });
    }
    this.isModified = true;
    const {pageName, path, parentId, isCustomPath, _id} = page;
    this.editedBranches.set(page._id, {pageName, path, parentId, isCustomPath, _id});
  }

  setTreeLength() {
    this.showingAllRows = this.filteredRows.length < this.maxRows;
    this.filteredRows = this.filteredRows.slice(0, this.maxRows);
  }

  filterRows(action) {
    localStorage.setItem('filterButton', filterButtons[action]);
    if (this.pageFormat === 'tree') {
      switch (action) {
        case 0:
          this.filteredRows = this.selectedWebsite.pages;
          this.activeFilterButton = 'all';
          break;
        case 1:
          this.filteredRows = this.selectedWebsite.pages.filter(page => page.isEnabled);
          this.activeFilterButton = 'published';
          break;
        case 2:
          this.filteredRows = this.selectedWebsite.pages.filter(page => !page.isEnabled);
          this.activeFilterButton = 'trashed';
          break;
      }
      this.setTreeLength();
      this.treeDataSource.data = null;
      this.treeDataSource.data = this.getNewTreeData();
    } else if (this.pageFormat === 'table') {
      this.pagesMap.forEach(page => {
        switch (action) {
          case 0:
            page.dataSource.data = page.pages;
            this.activeFilterButton = 'all';
            break;
          case 1:
            page.dataSource.data = page.pages.filter(item => item.isEnabled);
            this.activeFilterButton = 'published';
            break;
          case 2:
            page.dataSource.data = page.pages.filter(item => !item.isEnabled);
            this.activeFilterButton = 'trashed';
            break;
        }
      });
      this.countVisibleTableRows();
    }
  }

  /** Checks if change causes a circular dependency */
  checkCircularParent(parent: BranchData) {
    if (!parent) {
      return false;
    }
    if (parent.parentId === this.draggedRow._id) {
      this.noti.userAlert('Cannot insert row into itself');
      return true;
    }
    return this.checkCircularParent(this.filteredRows.find(page => page._id === parent.parentId));
  }

  addToBulkTree(row: BranchData, add: boolean) {
    if (add) {
      this.bulkActionsItems.push(row);
    } else {
      this.bulkActionsItems = this.bulkActionsItems.filter(page => page._id !== row._id);
    }
  }

  isAllSelectTree() {
    return this.filteredRows.length === this.bulkActionsItems.length;
  }

  masterToggleTree(checked) {
    this.filteredRows.forEach(page => {
      page.isChecked = checked;
    });
    this.bulkActionsItems = checked ? this.filteredRows : [];
  }

  saveTreeChanges() {
    this.savingTree = true;
    const saveData = new UpdatePagesPathRequest;
    saveData.websiteId = this.selectedWebsite._id;
    this.editedBranches.forEach((page, key) => {
      const pageData = new UpdatePageRequest;
      pageData.pageId = key;
      pageData.path = page.path;
      pageData.pageName = page.pageName;
      pageData.parentId = page.parentId;
      pageData.isCustomPath = page.isCustomPath || false;

      saveData.pages.push(pageData);
    });
    const token = this.authService.user.accessTokens[0].token;
    this.noti.isPublisher = true;
    this.pageService.updatePagesPath(token, saveData).then(() => {
      this.savingTree = false;
      this.isModified = false;
      this.editedBranches.clear();
      this.noti.successMsg('Saved changes');
    });
  }

  /**** END MAT TREE SCRIPT ****/


  ngOnDestroy() {
    this.projectsSubscription$.unsubscribe();
    this.pageFormat$.unsubscribe();
    this.communicatorService.pageListDisplay = 'table';
    this.communicatorService.activeView = null;
  }

  /**** MAT TABLE SCRIPT ****/
  countVisibleTableRows() {
    this.visibleTableRows = 0;
    this.pagesMap.forEach(pageType => {
      this.visibleTableRows += pageType.dataSource.filteredData.length;
    });
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected(table): boolean {
    const numSelected = table.selection.selected.length;
    const numRows = table.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle(table: IPagesAndData, selectAll) {
    this.isAllSelected(table) ?
      table.selection.clear() :
      table.dataSource.data.forEach(row => table.selection.select(row));
    this.removePagesFromBulk(table.pages);
    if (selectAll) {
      this.bulkActionsItems.push(...table.pages);
    }
    this.updateSelectedLabels();
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(table, row?: BranchData): string {
    if (!row) {
      return `${this.isAllSelected(table) ? 'select' : 'deselect'} all`;
    }
    return `${table.selection.isSelected(row) ? 'deselect' : 'select'} row`;
  }

  removePagesFromBulk(pages: BranchData[]) {
    pages.forEach(page => {
      const idx = this.bulkActionsItems.indexOf(page);
      if (idx > -1) {
        this.bulkActionsItems.splice(idx, 1);
      }
    });
  }

  // Returns page title is exist, if not returns page name
  getPageName(project: BranchData) {
    if (project.tags.length) {
      const titleTag = project.tags.filter((tag1) => tag1.name === 'title');
      return titleTag[0].content;
    }
    return project.pageName;
  }

  choosePageForEdit(data: BranchData) {
    this.communicatorService.selectedBranchData = data;
    this.router.navigate(['/project_manager/sites-control/'
    + this.project + '/' + this.website.crmWebsite.cmsId + '/' + data._id + '/edit']);
  }

  clonePage(pageData: BranchData) {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
      name: pageData.pageName
    };

    const dialogRef = this.cloneDialog.open(CloneModalComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(isClone => {
        if (isClone) {
          this.editable = true;
          // Set new path string
          let counter = 0;
          let isPathAlreadyExist = true;
          let newPath = pageData.pageName;

          while (isPathAlreadyExist) {
            isPathAlreadyExist = false;
            if (counter > 0) {
              newPath = pageData.pageName + counter;
            }
            for (const page of this.selectedWebsite.pages) {
              if (page.path.includes(newPath)) {
                isPathAlreadyExist = true;
              }
            }
            counter++;
          }

          this.pageService.clonePage(this.authService.user.accessTokens[0].token, pageData._id, this.selectedWebsite._id, '/' +
            slug('/' + newPath) + '.html'.replace(/[^a-zA-Z_.-0-9]+/g, ''))
            .then(() => {
              this.noti.successMsg('Page cloned');
              this.communicatorControllerService.getWebsite(this.communicatorService.selectedProject, this.website.warehouseWebsite._id,
                [GetWebsiteByCmsIdPopulationItem.GLOBAL_ASSETS, GetWebsiteByCmsIdPopulationItem.PROVIDERS], true);
              this.setTableData();
            }, err => {
              console.log(err);
              this.noti.errorMsg();
            });
        }
      }
    );
  }

  routeToWebsiteEditor(e: BranchData) {
    this.communicatorService.selectedBranchData = e;
    this.router.navigate(['/editor/page/' + this.website.crmWebsite.cmsId, e._id]);
  }

  setTableData() {
    for (const page of this.selectedWebsite.pages) {

      page.title = this.getPageName(page);
      if (this.pagesMap.has(page.pageType)) {
        this.pagesMap.get(page.pageType).pages.push(page);
      } else {
        this.pagesMap.set(page.pageType, {pages: [page], dataSource: null, selection: null});
      }
    }

    for (const pageGroup of Array.from(this.pagesMap.values())) {
      pageGroup.dataSource = new MatTableDataSource(pageGroup.pages);
      pageGroup.selection = new SelectionModel<BranchData>(true, []);
    }
    this.mapKeysArray = Array.from(this.pagesMap.keys());
  }

  getType(id: number): any {
    return PageType[id];
  }

  openMultiCloneDialog() {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '610px',
      dialogConfig.height = '660px',
      dialogConfig.disableClose = true;
    dialogConfig.data = {
      warehouseId: this.website.warehouseWebsite._id

    };

    this.dialog.open(MultipleCloneComponent, dialogConfig);
  }

  openBulkActionsModal(state) {
    if (!state) {
      this.showBulkModal = false;
      return;
    }
    if (this.bulkActionsItems.length === 0) {
      this.noti.errorMsg('No pages selected');
      return;
    }
    this.modalState = state;
    this.showBulkModal = true;
  }

  addToBulk(ele: IPagesAndData, add, row) {
    ele.selection.toggle(row);
    if (add) {
      this.bulkActionsItems.push(row);
    } else {
      const idx = this.bulkActionsItems.indexOf(row);
      this.bulkActionsItems.splice(idx, 1);
    }
    this.updateSelectedLabels();
  }

  updateSelectedLabels() {
    this.selectedLabels = [];
    this.bulkActionsItems.forEach(page => {
      page.semanticTags.forEach(label => {
        if (!this.selectedLabels.includes(label)) {
          this.selectedLabels.push(label);
        }
      });
    });
  }

  editMultipleLabels(labels) {
    this.showBulkModal = false;
    const website = this.communicatorService.selectedProjectWebsite;
    this.bulkActionsItems.forEach(page => {
      labels.forEach(label => {
        if (this.modalState === 'add') {
          if (!page.semanticTags.includes(label)) {
            page.semanticTags.push(label);
          }
          if (!website.semanticTags.includes(label)) {
            website.semanticTags.push(label);
          }
        } else if (this.modalState === 'remove') {
          const idx = page.semanticTags.findIndex(x => x === label);
          if (idx > -1) {
            page.semanticTags.splice(idx, 1);
          }
        }
      });
    });
    const reqObj = {
      pageIds: this.bulkActionsItems.map(page => page._id),
      labels: labels
    };
    if (this.modalState === 'add') {
      this.websiteService.addMultipleSemanticTags(this.authService.user.accessTokens[0].token, reqObj)
        .then(() => {
          this.noti.successMsg('Labels added');
          this.updateSelectedLabels();
        })
        .catch(err => {
          this.noti.errorMsg('Failed to update server');
          console.error(err);
        });
    } else if (this.modalState === 'remove') {
      this.websiteService.removeMultipleSemanticTags(this.authService.user.accessTokens[0].token, reqObj)
        .then(() => {
          this.noti.successMsg('Labels removed');
          this.updateSelectedLabels();
        })
        .catch(err => {
          this.noti.errorMsg('Failed to update server');
          console.error(err);
        });
    }
  }

  langaugeToKey(langaugeValue: Language) {
    for (const languageRunner in Language) {
      if (Language[languageRunner] === langaugeValue) {
        return languageRunner;
      }
    }
  }

  pageTypeToString(pageType) {
    return PageType[pageType];
  }

  getKabab(str: string): string {
    return str.replace(/ /g, '-');
  }
}
}
