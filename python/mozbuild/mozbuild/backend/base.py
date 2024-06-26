# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, unicode_literals

from abc import (
    ABCMeta,
    abstractmethod,
)

import errno
import os
import time

from contextlib import contextmanager

from mach.mixin.logging import LoggingMixin

import mozpack.path as mozpath
from ..preprocessor import Preprocessor
from ..pythonutil import iter_modules_in_path
from ..util import FileAvoidWrite
from ..frontend.data import ContextDerived
from .configenvironment import ConfigEnvironment
from mozbuild.base import ExecutionSummary


class BuildBackend(LoggingMixin):
    """Abstract base class for build backends.

    A build backend is merely a consumer of the build configuration (the output
    of the frontend processing). It does something with said data. What exactly
    is the discretion of the specific implementation.
    """

    __metaclass__ = ABCMeta

    def __init__(self, environment):
        assert isinstance(environment, ConfigEnvironment)

        self.populate_logger()

        self.environment = environment

        # Files whose modification should cause a new read and backend
        # generation.
        self.backend_input_files = set()

        # Files generated by the backend.
        self._backend_output_files = set()

        # Previously generated files.
        self._backend_output_list_file = mozpath.join(environment.topobjdir,
            'backend.%s' % self.__class__.__name__)
        self._backend_output_list = set()
        if os.path.exists(self._backend_output_list_file):
            l = open(self._backend_output_list_file).read().split('\n')
            self._backend_output_list.update(mozpath.normsep(p) for p in l)

        self._environments = {}
        self._environments[environment.topobjdir] = environment

        # The number of backend files created.
        self._created_count = 0

        # The number of backend files updated.
        self._updated_count = 0

        # The number of unchanged backend files.
        self._unchanged_count = 0

        # The number of deleted backend files.
        self._deleted_count = 0

        # The total wall time spent in the backend. This counts the time the
        # backend writes out files, etc.
        self._execution_time = 0.0

        # Mapping of changed file paths to diffs of the changes.
        self.file_diffs = {}

        self._init()

    def summary(self):
        return ExecutionSummary(
            self.__class__.__name__.replace('Backend', '') +
            ' backend executed in {execution_time:.2f}s\n  '
            '{total:d} total backend files; '
            '{created:d} created; '
            '{updated:d} updated; '
            '{unchanged:d} unchanged; '
            '{deleted:d} deleted',
            execution_time=self._execution_time,
            total=self._created_count + self._updated_count +
            self._unchanged_count,
            created=self._created_count,
            updated=self._updated_count,
            unchanged=self._unchanged_count,
            deleted=self._deleted_count)

    def _init():
        """Hook point for child classes to perform actions during __init__.

        This exists so child classes don't need to implement __init__.
        """

    def consume(self, objs):
        """Consume a stream of TreeMetadata instances.

        This is the main method of the interface. This is what takes the
        frontend output and does something with it.

        Child classes are not expected to implement this method. Instead, the
        base class consumes objects and calls methods (possibly) implemented by
        child classes.
        """
        for obj in objs:
            obj_start = time.time()
            if not self.consume_object(obj):
                raise Exception('Unhandled object of type %s' % type(obj))
            self._execution_time += time.time() - obj_start

            if isinstance(obj, ContextDerived):
                self.backend_input_files |= obj.context_all_paths

        # Pull in all loaded Python as dependencies so any Python changes that
        # could influence our output result in a rescan.
        self.backend_input_files |= set(iter_modules_in_path(
            self.environment.topsrcdir, self.environment.topobjdir))

        finished_start = time.time()
        self.consume_finished()
        self._execution_time += time.time() - finished_start

        # Purge backend files created in previous run, but not created anymore
        delete_files = self._backend_output_list - self._backend_output_files
        for path in delete_files:
            try:
                os.unlink(mozpath.join(self.environment.topobjdir, path))
                self._deleted_count += 1
            except OSError:
                pass
        # Remove now empty directories
        for dir in set(mozpath.dirname(d) for d in delete_files):
            try:
                os.removedirs(dir)
            except OSError:
                pass

        # Write out the list of backend files generated, if it changed.
        if self._deleted_count or self._created_count or \
                not os.path.exists(self._backend_output_list_file):
            with open(self._backend_output_list_file, 'w') as fh:
                fh.write('\n'.join(sorted(self._backend_output_files)))
        elif self._updated_count:
            with open(self._backend_output_list_file, 'a'):
                os.utime(self._backend_output_list_file, None)

    @abstractmethod
    def consume_object(self, obj):
        """Consumes an individual TreeMetadata instance.

        This is the main method used by child classes to react to build
        metadata.
        """

    def consume_finished(self):
        """Called when consume() has completed handling all objects."""

    @contextmanager
    def _write_file(self, path=None, fh=None):
        """Context manager to write a file.

        This is a glorified wrapper around FileAvoidWrite with integration to
        update the summary data on this instance.

        Example usage:

            with self._write_file('foo.txt') as fh:
                fh.write('hello world')
        """

        if path is not None:
            assert fh is None
            fh = FileAvoidWrite(path, capture_diff=True)
        else:
            assert fh is not None

        dirname = mozpath.dirname(fh.name)
        try:
            os.makedirs(dirname)
        except OSError as error:
            if error.errno != errno.EEXIST:
                raise

        yield fh

        self._backend_output_files.add(mozpath.relpath(fh.name, self.environment.topobjdir))
        existed, updated = fh.close()
        if not existed:
            self._created_count += 1
        elif updated:
            self._updated_count += 1
            if fh.diff:
                self.file_diffs[fh.name] = fh.diff
        else:
            self._unchanged_count += 1

    @contextmanager
    def _get_preprocessor(self, obj):
        '''Returns a preprocessor with a few predefined values depending on
        the given BaseConfigSubstitution(-like) object, and all the substs
        in the current environment.'''
        pp = Preprocessor()
        srcdir = mozpath.dirname(obj.input_path)
        pp.context.update(obj.config.substs)
        pp.context.update(
            top_srcdir=obj.topsrcdir,
            topobjdir=obj.topobjdir,
            srcdir=srcdir,
            relativesrcdir=mozpath.relpath(srcdir, obj.topsrcdir) or '.',
            DEPTH=mozpath.relpath(obj.topobjdir, mozpath.dirname(obj.output_path)) or '.',
        )
        pp.do_filter('attemptSubstitution')
        pp.setMarker(None)
        with self._write_file(obj.output_path) as fh:
            pp.out = fh
            yield pp
