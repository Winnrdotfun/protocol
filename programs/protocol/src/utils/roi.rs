pub fn find_top_n_rois(rois: &Vec<(usize, f64)>, n: usize) -> Vec<(usize, f64)> {
    let num_entries = rois.len();

    if rois.len() <= n {
        let mut x = rois.clone();
        x.sort_by(|a, b| b.1.total_cmp(&a.1));
        return x;
    }

    let mut min_heap = Vec::with_capacity(n);
    for i in 0..n {
        min_heap.push(rois[i]);
    }

    min_heapify(&mut min_heap);

    for i in n..num_entries {
        if rois[i].1 > min_heap[0].1 {
            min_heap[0] = rois[i];
            sift_down(&mut min_heap, 0);
        }
    }

    min_heap.sort_by(|a, b| b.1.total_cmp(&a.1));

    min_heap
}

fn min_heapify(arr: &mut Vec<(usize, f64)>) {
    let len = arr.len();
    for i in (0..len / 2).rev() {
        sift_down(arr, i);
    }
}

fn sift_down(arr: &mut Vec<(usize, f64)>, mut root: usize) {
    let len = arr.len();
    loop {
        let left = 2 * root + 1;
        let right = 2 * root + 2;
        let mut smallest = root;

        if left < len && arr[left].1 < arr[smallest].1 {
            smallest = left;
        }

        if right < len && arr[right].1 < arr[smallest].1 {
            smallest = right;
        }

        if smallest == root {
            break;
        }

        arr.swap(root, smallest);
        root = smallest;
    }
}
